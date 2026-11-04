namespace Vuxo.Domain.Inventory;

public sealed record EquippedInventoryItem(
    string PlayerId, string Slot, Guid GrantId, string ItemKey,
    Guid AwardEventId, Guid CorrelationId, DateTimeOffset EquippedAtUtc);

public interface IPlayerEquipmentRepository
{
    Task<IReadOnlyList<EquippedInventoryItem>> GetForPlayerAsync(
        string playerId, CancellationToken cancellationToken = default);

    Task EquipAsync(EquippedInventoryItem item, CancellationToken cancellationToken = default);

    Task UnequipAsync(
        string playerId, string slot, CancellationToken cancellationToken = default);
}
