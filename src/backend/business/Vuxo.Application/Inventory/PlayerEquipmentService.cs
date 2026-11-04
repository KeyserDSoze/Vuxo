using Vuxo.Application.Events;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.Players;

namespace Vuxo.Application.Inventory;

public sealed class PlayerEquipmentService(
    IPlayerInventoryRepository inventory,
    IPlayerEquipmentRepository equipment,
    IPlayerCharacterRepository characters,
    IGameEventStore events,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<InventoryStack>> GetStacksAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var awards = await inventory.GetForPlayerAsync(playerId.Trim(), cancellationToken);
        var equipped = await equipment.GetForPlayerAsync(playerId.Trim(), cancellationToken);
        var equippedIds = equipped.Select(x => x.GrantId).ToHashSet();

        return awards.GroupBy(x => x.ItemKey, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new InventoryStack(
                group.Key, group.Count(), group.Count(x => equippedIds.Contains(x.GrantId)),
                group.Where(x => !equippedIds.Contains(x.GrantId))
                    .Select(x => x.GrantId).ToArray()))
            .ToArray();
    }

    public async Task<EquipmentView> GetEquipmentAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var owner = playerId.Trim();
        var items = await equipment.GetForPlayerAsync(owner, cancellationToken);
        var character = await characters.GetByOwnerIdAsync(owner, cancellationToken);
        return new EquipmentView(
            items.OrderBy(x => x.Slot, StringComparer.Ordinal).ToArray(),
            character is null ? null : EquipmentRules.Evaluate(character.Attributes, items));
    }

    public async Task<EquipmentView> EquipAsync(
        string playerId, Guid grantId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var owner = playerId.Trim();
        if (grantId == Guid.Empty) throw new EquipmentException(EquipmentErrorCodes.NotOwned);

        // Award ownership is always loaded by the authenticated principal.
        var awards = await inventory.GetForPlayerAsync(owner, cancellationToken);
        var award = awards.FirstOrDefault(x => x.GrantId == grantId)
            ?? throw new EquipmentException(EquipmentErrorCodes.NotOwned);
        var slot = EquipmentRules.SlotFor(award.ItemKey)
            ?? throw new EquipmentException(EquipmentErrorCodes.NotEquippable);

        var character = await characters.GetByOwnerIdAsync(owner, cancellationToken);
        if (character is null) throw new EquipmentException(EquipmentErrorCodes.CharacterRequired);

        var existing = await equipment.GetForPlayerAsync(owner, cancellationToken);
        if (existing.Any(x => x.GrantId == grantId))
            throw new EquipmentException(EquipmentErrorCodes.AlreadyEquipped);
        if (existing.Any(x => x.Slot == slot))
            throw new EquipmentException(EquipmentErrorCodes.SlotOccupied);

        var item = new EquippedInventoryItem(
            owner, slot, grantId, award.ItemKey,
            award.AwardEventId, award.CorrelationId, timeProvider.GetUtcNow());
        await equipment.EquipAsync(item, cancellationToken);
        await AppendEventAsync("inventory.equipped", item, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetEquipmentAsync(owner, cancellationToken);
    }

    public async Task<EquipmentView> UnequipAsync(
        string playerId, string slot, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (slot is not EquipmentRules.Relic and not EquipmentRules.Charm)
            throw new EquipmentException(EquipmentErrorCodes.InvalidSlot);

        var owner = playerId.Trim();
        var items = await equipment.GetForPlayerAsync(owner, cancellationToken);
        var item = items.FirstOrDefault(x => x.Slot == slot)
            ?? throw new EquipmentException(EquipmentErrorCodes.NotEquipped);
        await equipment.UnequipAsync(owner, slot, cancellationToken);
        await AppendEventAsync("inventory.unequipped", item, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetEquipmentAsync(owner, cancellationToken);
    }

    private async Task AppendEventAsync(string eventType, EquippedInventoryItem item,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        await events.AppendAsync(
            new GameEventEnvelope(
                Guid.NewGuid(), eventType, GameEventVisibilityScope.Player,
                item.PlayerId, item.CorrelationId, item.AwardEventId,
                EquipmentRules.Version, now),
            GameEventPayloadSerializer.Serialize(eventType, new
            {
                item.GrantId,
                item.ItemKey,
                item.Slot,
                happenedAtUtc = now
            }), cancellationToken);
    }
}

public sealed record InventoryStack(string ItemKey, int Quantity, int EquippedQuantity,
    IReadOnlyList<Guid> AvailableGrantIds);

public sealed record EquipmentView(
    IReadOnlyList<EquippedInventoryItem> Items,
    EffectiveEquipmentStats? Stats);

public static class EquipmentErrorCodes
{
    public const string NotOwned = "equipment_item_not_owned";
    public const string NotEquippable = "equipment_item_not_equippable";
    public const string AlreadyEquipped = "equipment_item_already_equipped";
    public const string SlotOccupied = "equipment_slot_occupied";
    public const string CharacterRequired = "equipment_character_required";
    public const string InvalidSlot = "equipment_invalid_slot";
    public const string NotEquipped = "equipment_slot_empty";
}

public sealed class EquipmentException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
