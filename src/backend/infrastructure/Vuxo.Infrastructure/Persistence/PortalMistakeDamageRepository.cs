using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Damage is never a client command: this repository is called only after
/// server-side portal rule validation, then rechecks grant ownership and state.
/// Character FOR UPDATE serializes with rest and consumable healing.
/// </summary>
public sealed class PortalMistakeDamageRepository(VuxoDbContext db, IGameEventStore events)
    : IPortalMistakeDamageRepository
{
    public async Task<PortalMistakeDamageResult?> ApplyFirstMistakeAsync(
        string playerId, Guid grantId, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        var chars = await db.PlayerCharacters.FromSqlInterpolated(
            $"SELECT * FROM player_characters WHERE \"OwnerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var character = chars.SingleOrDefault();
        if (character is null) return null;

        var grantRows = await db.ExclusiveContentGrants.FromSqlInterpolated(
            $"SELECT * FROM exclusive_content_grants WHERE \"Id\" = {grantId} AND \"PlayerId\" = {playerId} FOR UPDATE")
            .ToListAsync(cancellationToken);
        var grant = grantRows.SingleOrDefault();
        if (grant is null || grant.ConsumedAtUtc is not null ||
            grant.ExpiresAtUtc is { } expires && expires <= now ||
            grant.PortalKey != PortalSequenceRules.PortalKey)
            return null;

        var previous = await db.PortalMistakeDamages.AsNoTracking()
            .SingleOrDefaultAsync(x => x.GrantId == grantId, cancellationToken);
        if (previous is not null)
            return new(grantId, previous.CurrentHealth, character.CurrentHealth,
                checked(character.Constitution * 10), Damage: 0, Applied: false);

        var max = checked(character.Constitution * 10);
        var before = character.CurrentHealth;
        var damage = PortalMistakeDamageRules.CalculateDamage(before, max);
        character.CurrentHealth = before - damage;
        var receipt = new PortalMistakeDamageEntity
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            GrantId = grantId,
            PlayerId = playerId,
            EventId = Guid.NewGuid(),
            PreviousHealth = before,
            CurrentHealth = character.CurrentHealth,
            MaxHealth = max,
            Damage = damage,
            OccurredAtUtc = now
        };
        await db.PortalMistakeDamages.AddAsync(receipt, cancellationToken);
        await events.AppendAsync(new GameEventEnvelope(
            receipt.EventId, "portal.sequence_mistake_damage",
            GameEventVisibilityScope.Player, playerId,
            grant.CorrelationId, grant.GrantEventId,
            PortalMistakeDamageRules.Version, now),
            GameEventPayloadSerializer.Serialize("portal.sequence_mistake_damage", new
            {
                receipt.Id, receipt.GrantId, receipt.CharacterId,
                receipt.PreviousHealth, receipt.CurrentHealth,
                receipt.MaxHealth, receipt.Damage,
                portalRuleVersion = grant.RuleVersion,
                occurredAtUtc = now
            }), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return new(grantId, before, receipt.CurrentHealth, max, damage, Applied: true);
    }
}
