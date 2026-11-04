using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Inventory;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class PlayerEquipmentRepository(VuxoDbContext db) : IPlayerEquipmentRepository
{
    public async Task<IReadOnlyList<EquippedInventoryItem>> GetForPlayerAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var items = await db.PlayerEquippedItems.AsNoTracking()
            .Where(e => e.PlayerId == playerId.Trim())
            .Join(db.PlayerInventoryAwards.AsNoTracking(),
                e => new { e.GrantId, e.PlayerId },
                award => new { award.GrantId, award.PlayerId },
                (e, award) => new
                {
                    e.PlayerId, e.Slot, e.GrantId, award.ItemKey,
                    award.AwardEventId, award.CorrelationId, e.EquippedAtUtc
                })
            .ToArrayAsync(cancellationToken);

        return items.Select(x => new EquippedInventoryItem(
            x.PlayerId, x.Slot, x.GrantId, x.ItemKey,
            x.AwardEventId, x.CorrelationId, x.EquippedAtUtc)).ToArray();
    }

    public async Task EquipAsync(EquippedInventoryItem item,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(item);
        await db.PlayerEquippedItems.AddAsync(new PlayerEquippedItemEntity
        {
            PlayerId = item.PlayerId, Slot = item.Slot,
            GrantId = item.GrantId, EquippedAtUtc = item.EquippedAtUtc
        }, cancellationToken);
    }

    public async Task UnequipAsync(string playerId, string slot,
        CancellationToken cancellationToken = default)
    {
        var entity = await db.PlayerEquippedItems.SingleAsync(
            x => x.PlayerId == playerId && x.Slot == slot, cancellationToken);
        db.PlayerEquippedItems.Remove(entity);
    }
}
