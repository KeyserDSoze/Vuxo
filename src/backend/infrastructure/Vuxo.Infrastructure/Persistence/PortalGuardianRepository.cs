using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// A server-owned portal encounter authorizes a PvE turn; the browser can
/// choose only a known card and expected turn, never damage, foe or HP.
/// All changes share the character FOR UPDATE lock with rest/heal/damage.
/// </summary>
public sealed class PortalGuardianRepository(VuxoDbContext db, IGameEventStore events)
    : IPortalGuardianRepository
{
    public async Task<PortalGuardianStatus?> GetAsync(string playerId, Guid grantId,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var snapshot = await (
            from state in db.PortalEncounterStates.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = state.PortalGrantId, state.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            join character in db.PlayerCharacters.AsNoTracking()
                on state.CharacterId equals character.Id
            where state.PlayerId == playerId && state.PortalGrantId == grantId
            select new { state, grant.ConsumedAtUtc, grant.ExpiresAtUtc, character.CurrentHealth, character.Constitution })
            .SingleOrDefaultAsync(cancellationToken);
        if (snapshot is null ||
            !PortalEncounterRules.IsActive(now, snapshot.state.ExpiresAtUtc, snapshot.ConsumedAtUtc) ||
            snapshot.ExpiresAtUtc is { } expiry && expiry <= now)
            return null;

        return new(grantId, snapshot.state.GuardianTurn, snapshot.state.GuardianHealth,
            snapshot.state.GuardianMaxHealth, snapshot.CurrentHealth,
            checked(snapshot.Constitution * 10), snapshot.state.GuardianOutcome,
            snapshot.state.GuardianRuleVersion);
    }

    public async Task<IReadOnlyList<PortalGuardianHistoryEntry>?> GetHistoryAsync(
        string playerId, Guid grantId, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        // Only the current live and server-verified encounter may be read.
        // The event boundary prevents receipts from an older visit leaking
        // into a later encounter for the same character and portal grant.
        var scope = await (
            from state in db.PortalEncounterStates.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = state.PortalGrantId, state.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            where state.PlayerId == playerId && state.PortalGrantId == grantId
                && grant.PortalKey == PortalSequenceRules.PortalKey
            select new
            {
                state.CharacterId, state.StartEventId, state.GuardianTurn,
                state.ExpiresAtUtc, grant.ConsumedAtUtc,
                GrantExpiresAtUtc = grant.ExpiresAtUtc
            }).SingleOrDefaultAsync(cancellationToken);
        if (scope is null ||
            !PortalEncounterRules.IsActive(now, scope.ExpiresAtUtc, scope.ConsumedAtUtc) ||
            scope.GrantExpiresAtUtc is { } expiry && expiry <= now)
            return null;

        return await db.PortalGuardianTurns.AsNoTracking()
            .Where(turn => turn.PlayerId == playerId && turn.PortalGrantId == grantId &&
                turn.CharacterId == scope.CharacterId &&
                turn.EncounterEventId == scope.StartEventId &&
                turn.Turn <= scope.GuardianTurn)
            .OrderBy(turn => turn.Turn)
            .Take(PortalGuardianRules.MaximumTurns)
            .Select(turn => new PortalGuardianHistoryEntry(
                turn.Turn, turn.Action, turn.GuardianAction,
                turn.DamageDealt, turn.DamageTaken,
                turn.GuardianHealthAfter, turn.PlayerHealthAfter,
                turn.Outcome, turn.OccurredAtUtc))
            .ToListAsync(cancellationToken);
    }

    public async Task<PortalGuardianTurnResult> PlayAsync(
        string playerId, Guid grantId, string action, int expectedTurn,
        Guid idempotencyKey, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        var chars = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var character = chars.SingleOrDefault()
            ?? throw new PortalGuardianException(PortalGuardianErrorCodes.Unavailable);

        // Stable replay BEFORE expiry / state checks: a lost response may
        // arrive after the battle ended and must not apply the turn twice.
        var previous = await db.PortalGuardianTurns.AsNoTracking()
            .SingleOrDefaultAsync(x => x.PlayerId == playerId
                && x.IdempotencyKey == idempotencyKey, cancellationToken);
        if (previous is not null)
        {
            if (previous.PortalGrantId != grantId ||
                previous.Action != action || previous.Turn != expectedTurn + 1)
                throw new PortalGuardianException(PortalGuardianErrorCodes.KeyReused);
            return ToResult(previous, true);
        }

        var state = await db.PortalEncounterStates
            .SingleOrDefaultAsync(x => x.CharacterId == character.Id, cancellationToken);
        if (state is null || state.PortalGrantId != grantId ||
            !await PortalEncounterGuard.IsActiveAsync(db, character.Id, now, cancellationToken))
            throw new PortalGuardianException(PortalGuardianErrorCodes.Unavailable);

        var grants = await db.ExclusiveContentGrants.FromSqlInterpolated(
            $"SELECT * FROM exclusive_content_grants WHERE \"Id\" = {grantId} AND \"PlayerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var grant = grants.SingleOrDefault();
        if (grant is null || grant.ConsumedAtUtc is not null ||
            grant.ExpiresAtUtc is { } expiry && expiry <= now ||
            grant.PortalKey != PortalSequenceRules.PortalKey)
            throw new PortalGuardianException(PortalGuardianErrorCodes.Unavailable);
        if (state.GuardianOutcome != PortalGuardianRules.Ongoing)
            throw new PortalGuardianException(PortalGuardianErrorCodes.Finished);
        if (state.GuardianTurn != expectedTurn)
            throw new PortalGuardianException(PortalGuardianErrorCodes.StaleTurn);
        if (!PortalGuardianRules.IsActionForVersion(action, state.GuardianRuleVersion))
            throw new PortalGuardianException(PortalGuardianErrorCodes.InvalidAction);
        if (character.CurrentHealth <= 1)
            throw new PortalGuardianException(PortalGuardianErrorCodes.TooInjured);

        // now was sampled by PortalGuardianService BEFORE we waited for the
        // character FOR UPDATE lock. Another device may therefore have committed
        // the preceding turn with a later timestamp in the meantime. A reversed
        // receipt order would make the canonical history appear corrupt.
        // The lock serializes all turns for this character: clamp this turn's
        // receipt AND audit timestamp to at least the last committed turn's
        // instant (ties are valid), without altering damage or replay receipts.
        var occurredAtUtc = now;
        if (state.GuardianTurn > 0)
        {
            var priorTime = await db.PortalGuardianTurns.AsNoTracking()
                .Where(x => x.PlayerId == playerId &&
                    x.PortalGrantId == grantId &&
                    x.CharacterId == character.Id &&
                    x.EncounterEventId == state.StartEventId &&
                    x.Turn == state.GuardianTurn)
                .Select(x => (DateTimeOffset?)x.OccurredAtUtc)
                .SingleOrDefaultAsync(cancellationToken);
            if (priorTime is null)
                throw new PortalGuardianException(PortalGuardianErrorCodes.Unavailable);
            if (priorTime.Value > occurredAtUtc)
                occurredAtUtc = priorTime.Value;
        }

        var turn = expectedTurn + 1;
        var resolved = PortalGuardianRules.Resolve(grant.Seed, turn, action,
            character.Strength, character.Dexterity,
            character.CurrentHealth, checked(character.Constitution * 10),
            state.GuardianHealth, state.GuardianMaxHealth,
            state.GuardianRuleVersion);

        var receipt = new PortalGuardianTurnEntity
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            PlayerId = playerId,
            PortalGrantId = grantId,
            EncounterEventId = state.StartEventId,
            TurnEventId = Guid.NewGuid(),
            IdempotencyKey = idempotencyKey,
            Turn = turn,
            Action = action,
            GuardianAction = resolved.GuardianAction,
            PlayerHealthBefore = character.CurrentHealth,
            PlayerHealthAfter = resolved.PlayerHealth,
            PlayerMaxHealth = checked(character.Constitution * 10),
            GuardianHealthBefore = state.GuardianHealth,
            GuardianHealthAfter = resolved.GuardianHealth,
            GuardianMaxHealth = state.GuardianMaxHealth,
            DamageDealt = resolved.DamageDealt,
            DamageTaken = resolved.DamageTaken,
            Outcome = resolved.Outcome,
            OccurredAtUtc = occurredAtUtc
        };
        character.CurrentHealth = resolved.PlayerHealth;
        state.GuardianHealth = resolved.GuardianHealth;
        state.GuardianTurn = turn;
        state.GuardianOutcome = resolved.Outcome;
        await db.PortalGuardianTurns.AddAsync(receipt, cancellationToken);
        await events.AppendAsync(new GameEventEnvelope(
            receipt.TurnEventId, "portal.guardian_turn_resolved",
            GameEventVisibilityScope.Player, playerId,
            grant.CorrelationId, state.StartEventId,
            state.GuardianRuleVersion, occurredAtUtc),
            GameEventPayloadSerializer.Serialize("portal.guardian_turn_resolved", new
            {
                receipt.Id, receipt.CharacterId, receipt.PortalGrantId,
                receipt.EncounterEventId, receipt.IdempotencyKey,
                receipt.Turn, receipt.Action, receipt.GuardianAction,
                receipt.PlayerHealthBefore, receipt.PlayerHealthAfter,
                receipt.GuardianHealthBefore, receipt.GuardianHealthAfter,
                receipt.DamageDealt, receipt.DamageTaken, receipt.Outcome,
                portalSeed = grant.Seed
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return ToResult(receipt, false);
    }

    private static PortalGuardianTurnResult ToResult(
        PortalGuardianTurnEntity turn, bool replayed) =>
        new(turn.PortalGrantId, turn.IdempotencyKey, turn.Turn,
            turn.Action, turn.GuardianAction, turn.DamageDealt, turn.DamageTaken,
            turn.GuardianHealthAfter, turn.GuardianMaxHealth,
            turn.PlayerHealthAfter, turn.PlayerMaxHealth, turn.Outcome, replayed);
}
