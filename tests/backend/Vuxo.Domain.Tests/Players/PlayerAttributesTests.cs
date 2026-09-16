using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class PlayerAttributesTests
{
    [Theory]
    [InlineData(0, 0, 0, 10, 0, 0, 100, 1.0)]
    [InlineData(0, 1, 0, 9, 0, 0, 90, 1.1)]
    [InlineData(2, 3, 1, 2, 1, 1, 20, 1.3)]
    [InlineData(0, 10, 0, 0, 0, 0, 0, 2.0)]
    public void Create_WithValidAllocation_ComputesDerivedStats(
        int strength,
        int dexterity,
        int intelligence,
        int constitution,
        int luck,
        int faith,
        int expectedHealth,
        double expectedSpeedMultiplier)
    {
        var attributes = PlayerAttributes.Create(strength, dexterity, intelligence, constitution, luck, faith);

        Assert.Equal(expectedHealth, attributes.MaxHealth);
        Assert.Equal(expectedSpeedMultiplier, attributes.MovementSpeedMultiplier, 10);
    }

    [Theory]
    [InlineData(0, 0, 0, 0, 0, 0)]
    [InlineData(2, 2, 2, 2, 2, 2)]
    [InlineData(11, 0, 0, 0, 0, 0)]
    public void Create_WhenAllocationIsNotTen_Throws(int strength, int dexterity, int intelligence, int constitution, int luck, int faith)
    {
        Assert.Throws<ArgumentException>(() => PlayerAttributes.Create(strength, dexterity, intelligence, constitution, luck, faith));
    }

    [Fact]
    public void Create_WhenAttributeIsNegative_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => PlayerAttributes.Create(-1, 1, 1, 3, 3, 3));
    }
}
