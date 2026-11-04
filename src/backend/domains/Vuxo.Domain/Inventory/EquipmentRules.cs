using Vuxo.Domain.Players;

namespace Vuxo.Domain.Inventory;

/// <summary>
/// Server-owned equipment slots and additive bonuses. Movement speed is
/// calculated by the world authority using this same versioned rule set.
/// </summary>
public static class EquipmentRules
{
    public const string Version = "equipment-v2";
    public const string Relic = "relic";
    public const string Charm = "charm";

    public static string? SlotFor(string? itemKey) => itemKey switch
    {
        InventoryItemCatalog.RuneShard => Relic,
        InventoryItemCatalog.GroveSeed => Charm,
        InventoryItemCatalog.TidalPearl => Charm,
        InventoryItemCatalog.SwiftFeather => Charm,
        _ => null
    };

    public static EquipmentBonuses BonusFor(string itemKey) => itemKey switch
    {
        InventoryItemCatalog.RuneShard => new(Intelligence: 1),
        InventoryItemCatalog.GroveSeed => new(Constitution: 1),
        InventoryItemCatalog.TidalPearl => new(Luck: 1),
        InventoryItemCatalog.SwiftFeather => new(Dexterity: 1),
        _ => throw new ArgumentException("Item has no equipment bonus.", nameof(itemKey))
    };

    public static EquipmentBonuses TotalBonuses(IEnumerable<EquippedInventoryItem> equipped)
    {
        ArgumentNullException.ThrowIfNull(equipped);
        var strength = 0;
        var dexterity = 0;
        var intelligence = 0;
        var constitution = 0;
        var luck = 0;
        var faith = 0;
        var slots = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in equipped)
        {
            if (!slots.Add(item.Slot) || SlotFor(item.ItemKey) != item.Slot)
                throw new ArgumentException("Invalid or duplicate equipment slot.", nameof(equipped));
            var bonus = BonusFor(item.ItemKey);
            strength += bonus.Strength;
            dexterity += bonus.Dexterity;
            intelligence += bonus.Intelligence;
            constitution += bonus.Constitution;
            luck += bonus.Luck;
            faith += bonus.Faith;
        }

        return new(strength, dexterity, intelligence, constitution, luck, faith);
    }

    public static EffectiveEquipmentStats Evaluate(
        PlayerAttributes baseAttributes, IEnumerable<EquippedInventoryItem> equipped)
    {
        ArgumentNullException.ThrowIfNull(baseAttributes);
        var bonus = TotalBonuses(equipped);
        return new EffectiveEquipmentStats(
            baseAttributes.Strength + bonus.Strength,
            baseAttributes.Dexterity + bonus.Dexterity,
            baseAttributes.Intelligence + bonus.Intelligence,
            baseAttributes.Constitution + bonus.Constitution,
            baseAttributes.Luck + bonus.Luck,
            baseAttributes.Faith + bonus.Faith,
            bonus);
    }
}

public sealed record EquipmentBonuses(
    int Strength = 0, int Dexterity = 0, int Intelligence = 0,
    int Constitution = 0, int Luck = 0, int Faith = 0);

public sealed record EffectiveEquipmentStats(
    int Strength, int Dexterity, int Intelligence, int Constitution,
    int Luck, int Faith, EquipmentBonuses Bonuses)
{
    public int MaxHealth => Constitution * 10;
    public double MovementSpeedMultiplier => 1d + Dexterity * 0.10d;
}
