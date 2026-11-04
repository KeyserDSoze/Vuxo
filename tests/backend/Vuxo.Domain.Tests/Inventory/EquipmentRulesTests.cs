using Vuxo.Domain.Inventory;
using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Inventory;

public sealed class EquipmentRulesTests
{
    private static readonly Guid Grant = Guid.Parse("11111111-1111-4111-8111-111111111111");

    [Theory]
    [InlineData(InventoryItemCatalog.RuneShard, EquipmentRules.Relic, 1, 0, 0)]
    [InlineData(InventoryItemCatalog.GroveSeed, EquipmentRules.Charm, 0, 1, 0)]
    [InlineData(InventoryItemCatalog.TidalPearl, EquipmentRules.Charm, 0, 0, 1)]
    public void Catalog_CanonicalItemsHaveFixedSlotsAndBonuses(
        string key, string expectedSlot, int intelligence, int constitution, int luck)
    {
        Assert.Equal(expectedSlot, EquipmentRules.SlotFor(key));
        var bonus = EquipmentRules.BonusFor(key);
        Assert.Equal(intelligence, bonus.Intelligence);
        Assert.Equal(constitution, bonus.Constitution);
        Assert.Equal(luck, bonus.Luck);
    }

    [Fact]
    public void SwiftFeatherCharm_IncreasesDexterityAndEffectiveServerMovementSpeed()
    {
        var character = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);
        var feather = Item(InventoryItemCatalog.SwiftFeather, EquipmentRules.Charm);
        Assert.Equal(EquipmentRules.Charm, EquipmentRules.SlotFor(feather.ItemKey));
        var effective = EquipmentRules.Evaluate(character, [feather]);
        Assert.Equal(3, effective.Dexterity);
        Assert.Equal(1, effective.Bonuses.Dexterity);
        Assert.Equal(1.3d, effective.MovementSpeedMultiplier, 8);
        Assert.Equal(2, character.Dexterity);
        Assert.Equal(1.2d, character.MovementSpeedMultiplier, 8);
        Assert.Equal("equipment-v2", EquipmentRules.Version);
    }

    [Fact]
    public void UnrecognizedItem_NeverGetsAnEquipmentSlotOrInventedStats()
    {
        Assert.Null(EquipmentRules.SlotFor("item.unknown"));
        Assert.Throws<ArgumentException>(() => EquipmentRules.BonusFor("item.unknown"));
    }

    [Fact]
    public void EffectiveStats_StaySeparateFromTenAllocatedBasePoints()
    {
        var baseStats = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);
        var loadout = new[]
        {
            Item(InventoryItemCatalog.RuneShard, EquipmentRules.Relic),
            Item(InventoryItemCatalog.GroveSeed, EquipmentRules.Charm)
        };
        var effective = EquipmentRules.Evaluate(baseStats, loadout);

        Assert.Equal(3, effective.Intelligence);
        Assert.Equal(3, effective.Constitution);
        Assert.Equal(30, effective.MaxHealth);
        Assert.Equal(2, baseStats.Intelligence);
        Assert.Equal(2, baseStats.Constitution);
        Assert.Equal(20, baseStats.MaxHealth);
        Assert.Equal(1.2d, effective.MovementSpeedMultiplier, 8);
        Assert.Equal(1, effective.Bonuses.Intelligence);
        Assert.Equal(1, effective.Bonuses.Constitution);
    }

    [Fact]
    public void DuplicateSlotsAndIncorrectSlotAssignment_AreRejected()
    {
        var charm = Item(InventoryItemCatalog.GroveSeed, EquipmentRules.Charm);
        var competing = Item(InventoryItemCatalog.TidalPearl, EquipmentRules.Charm);
        Assert.Throws<ArgumentException>(() => EquipmentRules.TotalBonuses([charm, competing]));
        Assert.Throws<ArgumentException>(() => EquipmentRules.TotalBonuses([
            Item(InventoryItemCatalog.RuneShard, EquipmentRules.Charm)
        ]));
    }

    private static EquippedInventoryItem Item(string key, string slot) =>
        new("player-a", slot, Grant, key, Guid.NewGuid(),
            Guid.NewGuid(), DateTimeOffset.UtcNow);
}
