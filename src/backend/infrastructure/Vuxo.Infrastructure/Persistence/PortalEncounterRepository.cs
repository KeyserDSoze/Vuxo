using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// A portal encounter can only be opened by trusted application orchestration
/// after server-validated world proximity. Character FOR UPDATE is shared with
/// all HP mutation paths. PostgreSQL, not SignalR memory, owns the lock.
/// </summary>
public sealed class PortalEncounterRepository(VuxoDbContext db, IGameEventStore events)
    : IPortalEncounterRepository
{
    public async Task<PortalEncounterStatus> GetStatusAsync(
        string playerId, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var state = await (
            from encounter in db.PortalEncounterStates.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = encounter.PortalGrantId, encounter.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            where encounter.PlayerId == playerId
            select new { encounter.PortalGrantId, encounter.ExpiresAtUtc, grant.ConsumedAtUtc })
            .SingleOrDefaultAsync(cancellationToken);
        return state is not null && PortalEncounterRules.IsActive(
                now, state.ExpiresAtUtc, state.ConsumedAtUtc)
            ? new(true, state.PortalGrantId, state.ExpiresAtUtc)
            : new(false, null, null);
    }

    public async Task<PortalEncounterStatus> StartVerifiedPortalAsync(
        string playerId, Guid portalGrantId, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        var characters = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var character = characters.SingleOrDefault()
            ?? throw new PortalEncounterException(PortalEncounterErrorCodes.CharacterRequired);

        var grants = await db.ExclusiveContentGrants.FromSqlInterpolated(
            $"SELECT * FROM exclusive_content_grants WHERE \"Id\" = {portalGrantId} AND \"PlayerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var grant = grants.SingleOrDefault();
        if (grant is null || grant.ConsumedAtUtc is not null ||
            grant.ExpiresAtUtc is { } expiry && expiry <= now ||
            grant.PortalKey != PortalSequenceRules.PortalKey)
            throw new PortalEncounterException(PortalEncounterErrorCodes.InvalidPortal);

        var state = await db.PortalEncounterStates
            .SingleOrDefaultAsync(x => x.CharacterId == character.Id, cancellationToken);
        if (state is not null && await PortalEncounterGuard.IsActiveAsync(
            db, character.Id, now, cancellationToken))
        {
            if (state.PortalGrantId != portalGrantId)
                throw new PortalEncounterException(PortalEncounterErrorCodes.AlreadyActive);
            return new(true, state.PortalGrantId, state.ExpiresAtUtc);
        }

        var eventId = Guid.NewGuid();
        var expiresAt = now.Add(PortalEncounterRules.MaximumDuration);
        if (state is null)
        {
            state = new PortalEncounterStateEntity
            {
                CharacterId = character.Id,
                PlayerId = playerId,
                PortalGrantId = portalGrantId,
                StartEventId = eventId,
                StartedAtUtc = now,
                ExpiresAtUtc = expiresAt,
                GuardianMaxHealth = PortalGuardianRules.GuardianMaxHealth(grant.Seed),
                GuardianHealth = PortalGuardianRules.GuardianMaxHealth(grant.Seed),
                GuardianTurn = 0,
                GuardianOutcome = PortalGuardianRules.Ongoing
            };
            await db.PortalEncounterStates.AddAsync(state, cancellationToken);
        }
        else
        {
            state.PortalGrantId = portalGrantId;
            state.StartEventId = eventId;
            state.StartedAtUtc = now;
            state.ExpiresAtUtc = expiresAt;
            state.GuardianMaxHealth = PortalGuardianRules.GuardianMaxHealth(grant.Seed);
            state.GuardianHealth = state.GuardianMaxHealth;
            state.GuardianTurn = 0;
            state.GuardianOutcome = PortalGuardianRules.Ongoing;
        }

        await events.AppendAsync(new GameEventEnvelope(
            eventId, "portal.encounter_started",
            GameEventVisibilityScope.Player, playerId,
            grant.CorrelationId, grant.GrantEventId, PortalEncounterRules.Version, now),
            GameEventPayloadSerializer.Serialize("portal.encounter_started", new
            {
                state.CharacterId,
                state.PortalGrantId,
                startedAtUtc = now,
                expiresAtUtc = expiresAt,
                portalRuleVersion = grant.RuleVersion
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return new(true, portalGrantId, expiresAt);
    }
}
