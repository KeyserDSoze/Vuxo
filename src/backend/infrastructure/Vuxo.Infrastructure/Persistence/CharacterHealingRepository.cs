using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Health, item spending and audit share a PostgreSQL transaction.
/// Character lock serializes rest/healing (and future damage mutations).
/// Award lock cooperates with equipment/consumption DB triggers to ensure
/// equipment and spending are mutually exclusive even across API nodes.
/// </summary>
public sealed class CharacterHealingRepository(VuxoDbContext db, IGameEventStore events)
    : ICharacterHealingRepository
{
    public async Task<CharacterHealingResult> HealAsync(string playerId, Guid grantId,
        Guid idempotencyKey, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var characters = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var character = characters.SingleOrDefault()
            ?? throw new CharacterHealingException(CharacterHealingErrorCodes.CharacterNotFound);

        var previous = await db.CharacterItemHeals.AsNoTracking()
            .SingleOrDefaultAsync(x => x.CharacterId == character.Id
                && x.IdempotencyKey == idempotencyKey, cancellationToken);
        if (previous is not null)
        {
            if (previous.GrantId != grantId)
                throw new CharacterHealingException(CharacterHealingErrorCodes.KeyReused);
            return ToResult(previous, replayed: true);
        }

        var awards = await db.PlayerInventoryAwards.FromSqlInterpolated(
            $"SELECT * FROM player_inventory_awards WHERE \"GrantId\" = {grantId} AND \"PlayerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var award = awards.SingleOrDefault()
            ?? throw new CharacterHealingException(CharacterHealingErrorCodes.ItemNotOwned);

        if (await db.CharacterItemHeals.AsNoTracking().AnyAsync(
            x => x.GrantId == grantId, cancellationToken))
            throw new CharacterHealingException(CharacterHealingErrorCodes.ItemUsed);
        if (await db.PlayerEquippedItems.AsNoTracking().AnyAsync(
            x => x.GrantId == grantId && x.PlayerId == playerId, cancellationToken))
            throw new CharacterHealingException(CharacterHealingErrorCodes.ItemEquipped);

        var max = checked(character.Constitution * 10);
        var restored = CharacterHealingRules.CalculateRestored(
            award.ItemKey, character.CurrentHealth, max);
        var before = character.CurrentHealth;
        character.CurrentHealth = before + restored;

        var receipt = new CharacterItemHealEntity
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            PlayerId = playerId,
            GrantId = grantId,
            IdempotencyKey = idempotencyKey,
            EventId = Guid.NewGuid(),
            PreviousHealth = before,
            CurrentHealth = character.CurrentHealth,
            MaxHealth = max,
            RestoredHealth = restored,
            ConsumedAtUtc = now
        };
        await db.CharacterItemHeals.AddAsync(receipt, cancellationToken);
        await events.AppendAsync(new GameEventEnvelope(
            receipt.EventId, "character.item_healed", GameEventVisibilityScope.Player,
            playerId, idempotencyKey, award.AwardEventId, CharacterHealingRules.Version, now),
            GameEventPayloadSerializer.Serialize("character.item_healed", new
            {
                receipt.Id, receipt.CharacterId, receipt.GrantId,
                award.ItemKey, receipt.IdempotencyKey,
                receipt.PreviousHealth, receipt.CurrentHealth,
                receipt.MaxHealth, receipt.RestoredHealth,
                consumedAtUtc = now
            }), cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToResult(receipt, replayed: false);
    }

    private static CharacterHealingResult ToResult(CharacterItemHealEntity use, bool replayed) =>
        new(use.GrantId, use.IdempotencyKey, use.PreviousHealth, use.CurrentHealth,
            use.MaxHealth, use.RestoredHealth, use.ConsumedAtUtc, replayed);
}
