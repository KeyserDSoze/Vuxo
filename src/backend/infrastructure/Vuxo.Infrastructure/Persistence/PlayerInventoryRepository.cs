using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Inventory;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Shares VuxoDbContext with grant consumption and audit. Callers issue one
/// SaveChangesAsync so EF saves all three changes in one DB transaction.
/// </summary>
public sealed class PlayerInventoryRepository(VuxoDbContext dbContext) : IPlayerInventoryRepository
{
    public async Task AddAsync(PlayerInventoryAward award, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(award);
        await dbContext.PlayerInventoryAwards.AddAsync(new PlayerInventoryAwardEntity
        {
            GrantId = award.GrantId,
            AwardEventId = award.AwardEventId,
            PlayerId = award.PlayerId,
            ItemKey = award.ItemKey,
            AwardedAtUtc = award.AwardedAtUtc,
            CorrelationId = award.CorrelationId,
            CausationId = award.CausationId
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<PlayerInventoryAward>> GetForPlayerAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var items = await dbContext.PlayerInventoryAwards.AsNoTracking()
            .Where(x => x.PlayerId == playerId.Trim())
            .OrderByDescending(x => x.AwardedAtUtc)
            .ThenBy(x => x.GrantId)
            .ToArrayAsync(cancellationToken);

        return items.Select(x => new PlayerInventoryAward(
            x.GrantId, x.AwardEventId, x.PlayerId, x.ItemKey,
            x.AwardedAtUtc, x.CorrelationId, x.CausationId)).ToArray();
    }
}
