using Vuxo.Domain.Inventory;
using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class CharacterHealingRulesTests
{
    [Theory]
    [InlineData(1, 20, 10)]
    [InlineData(10, 20, 10)]
    [InlineData(19, 20, 1)]
    [InlineData(7, 20, 10)]
    [InlineData(4, 5, 1)]
    public void GroveSeed_HealsTenHpUpToTheBaseMaximum(int current, int max, int amount) =>
        Assert.Equal(amount, CharacterHealingRules.CalculateRestored(
            InventoryItemCatalog.GroveSeed, current, max));

    [Theory]
    [InlineData(InventoryItemCatalog.RuneShard)]
    [InlineData(InventoryItemCatalog.TidalPearl)]
    [InlineData("item.forged.v1")]
    public void OnlyGroveSeed_IsConsumableHealing(string item)
    {
        var error = Assert.Throws<CharacterHealingException>(() =>
            CharacterHealingRules.CalculateRestored(item, 5, 20));
        Assert.Equal(CharacterHealingErrorCodes.NotConsumable, error.Code);
    }

    [Fact]
    public void CannotHealAtZeroOrMaximum()
    {
        Assert.Equal(CharacterHealingErrorCodes.Unavailable,
            Assert.Throws<CharacterHealingException>(() =>
                CharacterHealingRules.CalculateRestored(InventoryItemCatalog.GroveSeed, 0, 20)).Code);
        Assert.Equal(CharacterHealingErrorCodes.AlreadyFull,
            Assert.Throws<CharacterHealingException>(() =>
                CharacterHealingRules.CalculateRestored(InventoryItemCatalog.GroveSeed, 20, 20)).Code);
        Assert.Equal(CharacterHealingErrorCodes.Unavailable,
            Assert.Throws<CharacterHealingException>(() =>
                CharacterHealingRules.CalculateRestored(InventoryItemCatalog.GroveSeed, 0, 0)).Code);
    }

    [Theory]
    [InlineData(-1, 20)]
    [InlineData(21, 20)]
    [InlineData(1, -1)]
    public void CorruptHealthCannotBeHealed(int current, int maximum)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            CharacterHealingRules.CalculateRestored(InventoryItemCatalog.GroveSeed, current, maximum));
    }
}
