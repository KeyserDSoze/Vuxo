using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Serializes rest mutations per character across API nodes using the PostgreSQL
/// row lock. HP, idempotency receipt and private audit event commit atomically.
/// Future damage/consumable writers must use the same character locking protocol.
/// </summary>
public sealed class CharacterRestRepository(VuxoDbContext db, IGameEventStore events)
    : ICharacterRestRepository
{
    public async Task<CharacterRestResult> RestAsync(
        string ownerId, Guid idempotencyKey, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Fully parameterized query, NOT composed with LINQ server operators;
        // this locks one canonical character row until the transaction commits.
        var characters = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {ownerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var character = characters.SingleOrDefault()
            ?? throw new CharacterRestException(CharacterRestErrorCodes.CharacterNotFound);

        // Replay is checked before health/cooldown, returning the same
        // committed outcome without adding HP or a second audit event.
        var previous = await db.CharacterRestActions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.CharacterId == character.Id
                && x.IdempotencyKey == idempotencyKey, cancellationToken);
        if (previous is not null)
        {
            return ToResult(previous, replayed: true);
        }

        if (await PortalEncounterGuard.IsActiveAsync(
            db, character.Id, now, cancellationToken))
            throw new CharacterRestException(CharacterRestErrorCodes.EncounterActive);

        var latest = await db.CharacterRestActions.AsNoTracking()
            .Where(x => x.CharacterId == character.Id)
            .OrderByDescending(x => x.RestedAtUtc)
            .Select(x => (DateTimeOffset?)x.RestedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        var max = character.Constitution * 10;
        var restored = CharacterRestRules.CalculateRestored(
            character.CurrentHealth, max, now, latest);

        var before = character.CurrentHealth;
        character.CurrentHealth = before + restored;
        var action = new CharacterRestActionEntity
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            PlayerId = ownerId,
            IdempotencyKey = idempotencyKey,
            EventId = Guid.NewGuid(),
            PreviousHealth = before,
            CurrentHealth = character.CurrentHealth,
            MaxHealth = max,
            RestoredHealth = restored,
            RestedAtUtc = now
        };
        await db.CharacterRestActions.AddAsync(action, cancellationToken);
        await events.AppendAsync(new GameEventEnvelope(
            action.EventId,
            "character.rest_completed",
            GameEventVisibilityScope.Player,
            ownerId,
            idempotencyKey,
            idempotencyKey,
            CharacterRestRules.Version,
            now), GameEventPayloadSerializer.Serialize("character.rest_completed", new
            {
                action.Id,
                action.CharacterId,
                action.IdempotencyKey,
                action.PreviousHealth,
                action.CurrentHealth,
                action.MaxHealth,
                action.RestoredHealth,
                nextRestAtUtc = now.Add(CharacterRestRules.Cooldown)
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToResult(action, replayed: false);
    }

    private static CharacterRestResult ToResult(CharacterRestActionEntity action, bool replayed)
        => new(action.IdempotencyKey, action.PreviousHealth,
            action.CurrentHealth, action.MaxHealth, action.RestoredHealth,
            action.RestedAtUtc, action.RestedAtUtc.Add(CharacterRestRules.Cooldown), replayed);
}
