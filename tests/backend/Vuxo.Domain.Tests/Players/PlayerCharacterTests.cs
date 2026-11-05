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
        Assert.Equal(character.MaxHealth, character.CurrentHealth);
        Assert.Equal(20, character.CurrentHealth);
        Assert.Equal(20, character.Attributes.MaxHealth);
        Assert.Equal(1.3d, character.Attributes.MovementSpeedMultiplier, 10);
    }

    [Theory]
    [InlineData(0, 0, true)]
    [InlineData(1, 10, true)]
    [InlineData(10, 10, true)]
    [InlineData(-1, 10, false)]
    [InlineData(11, 10, false)]
    [InlineData(1, -1, false)]
    public void PlayerHealth_EnforcesBoundaries(int current, int maximum, bool valid)
    {
        if (valid)
        {
            var value = PlayerHealth.Restore(current, maximum);
            Assert.Equal(current, value.Current);
            Assert.Equal(maximum, value.Maximum);
        }
        else
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => PlayerHealth.Restore(current, maximum));
        }
    }

    [Fact]
    public void RehydratedCharacter_UsesPersistedCurrentHealth_NotMaximum()
    {
        var attributes = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);
        var saved = PlayerCharacter.Rehydrate(Guid.NewGuid(), "owner", "Vuxian", 0, attributes, Appearance(), 7);
        Assert.Equal(7, saved.CurrentHealth);
        Assert.Equal(20, saved.MaxHealth);
        Assert.Throws<ArgumentOutOfRangeException>(() => PlayerCharacter.Rehydrate(
            Guid.NewGuid(), "owner", "Vuxian", 0, attributes, Appearance(), 21));
    }

    [Fact]
    public void ConstitutionZero_StartsAtZeroHealth()
    {
        var attributes = PlayerAttributes.Create(0, 0, 0, 0, 10, 0);
        var character = PlayerCharacter.Create("owner", "Vuxian", attributes, Appearance());
        Assert.Equal(0, character.CurrentHealth);
        Assert.Equal(0, character.MaxHealth);
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
