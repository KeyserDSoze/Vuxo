using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class CharacterRestRulesTests
{
    [Theory]
    [InlineData(7, 20, 5)]
    [InlineData(19, 20, 1)]
    [InlineData(1, 1, 0)]
    [InlineData(1, 2, 1)]
    [InlineData(1, 10, 3)]
    [InlineData(1, 100, 25)]
    public void HealAmount_IsQuarterOfBaseMaxClampedToMissingHp(
        int current, int maximum, int expected)
    {
        if (current == maximum)
        {
            var error = Assert.Throws<CharacterRestException>(() =>
                CharacterRestRules.CalculateRestored(current, maximum, DateTimeOffset.UtcNow, null));
            Assert.Equal(CharacterRestErrorCodes.AlreadyFull, error.Code);
            return;
        }

        Assert.Equal(expected,
            CharacterRestRules.CalculateRestored(current, maximum, DateTimeOffset.UtcNow, null));
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(0, 10)]
    public void ZeroHealth_CannotUseRest(int current, int maximum)
    {
        var error = Assert.Throws<CharacterRestException>(() =>
            CharacterRestRules.CalculateRestored(current, maximum, DateTimeOffset.UtcNow, null));
        Assert.Equal(CharacterRestErrorCodes.Unavailable, error.Code);
    }

    [Fact]
    public void Cooldown_UsesServerClockNotClientAndRejectsUntilBoundary()
    {
        var now = new DateTimeOffset(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
        var last = now.AddMinutes(-29);
        var error = Assert.Throws<CharacterRestException>(() =>
            CharacterRestRules.CalculateRestored(7, 20, now, last));
        Assert.Equal(CharacterRestErrorCodes.Cooldown, error.Code);
        Assert.Equal(now.AddMinutes(1), error.NextAllowedAtUtc);
        Assert.Equal(5, CharacterRestRules.CalculateRestored(7, 20,
            now.AddMinutes(1), last));
    }

    [Theory]
    [InlineData(-1, 20)]
    [InlineData(21, 20)]
    [InlineData(1, -1)]
    public void InvalidHealth_IsRejectedBeforeRest(int current, int maximum)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            CharacterRestRules.CalculateRestored(current, maximum, DateTimeOffset.UtcNow, null));
    }
}
