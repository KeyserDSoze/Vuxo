using Vuxo.Domain.PersonalContent;

namespace Vuxo.Domain.Inventory;

/// <summary>
/// One immutable item award per consumed grant. GrantId is both the identity
/// and the relational idempotency key enforced by PostgreSQL.
/// </summary>
public sealed record PlayerInventoryAward(
    Guid GrantId,
    Guid AwardEventId,
    string PlayerId,
    string ItemKey,
    DateTimeOffset AwardedAtUtc,
    Guid CorrelationId,
    Guid CausationId)
{
    public const int Quantity = 1;

    public static PlayerInventoryAward FromConsumedGrant(
        ExclusiveContentGrant grant,
        Guid consumptionEventId,
        Guid awardEventId,
        DateTimeOffset awardedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(grant);
        if (!grant.IsConsumed)
            throw new InvalidOperationException("Only consumed grants can award an inventory item.");
        if (!InventoryItemCatalog.IsSupported(grant.RewardKey))
            throw new ArgumentException("Reward key is not in the canonical item catalog.", nameof(grant));
        if (grant.Id == Guid.Empty || consumptionEventId == Guid.Empty || awardEventId == Guid.Empty)
            throw new ArgumentException("All award and causation IDs must be non-empty.");

        return new PlayerInventoryAward(
            grant.Id, awardEventId, grant.PlayerId, grant.RewardKey,
            awardedAtUtc, grant.CorrelationId, consumptionEventId);
    }
}
