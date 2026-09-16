using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class PlayerCharacterTests
{
    [Theory]
    [InlineData("A")]
    [InlineData("AB")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXY")]
    public void Create_WhenNameLengthIsOutsideRange_Throws(string name)
    {
        var attributes = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            PlayerCharacter.Create("owner-1", name, attributes, Appearance()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WhenNameIsBlank_Throws(string name)
    {
        var attributes = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);

        Assert.Throws<ArgumentException>(() =>
            PlayerCharacter.Create("owner-1", name, attributes, Appearance()));
    }

    [Fact]
    public void Create_TrimsName_AndStartsAtLevelZero()
    {
        var attributes = PlayerAttributes.Create(2, 3, 1, 2, 1, 1);

        var character = PlayerCharacter.Create(" owner-1 ", "  Vuxian  ", attributes, Appearance());

        Assert.Equal("owner-1", character.OwnerId);
        Assert.Equal("Vuxian", character.Name);
        Assert.Equal(0, character.Level);
        Assert.Equal(20, character.Attributes.MaxHealth);
        Assert.Equal(1.3d, character.Attributes.MovementSpeedMultiplier, 10);
    }

    private static CharacterAppearance Appearance() => new(
        "hair-1",
        "black",
        "face-1",
        "body-1",
        "skin-1",
        "blue",
        "shorts",
        "black",
        "shoe-1",
        "white");
}
