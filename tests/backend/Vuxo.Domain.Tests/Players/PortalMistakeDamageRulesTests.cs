using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class PortalMistakeDamageRulesTests
{
    [Theory]
    [InlineData(20, 20, 2)]
    [InlineData(19, 20, 2)]
    [InlineData(2, 20, 2)]
    [InlineData(1, 20, 1)]
    [InlineData(0, 20, 0)]
    [InlineData(0, 0, 0)]
    public void IncorrectSequence_CannotDamageBeyondTwoOrBelowZero(
        int current, int maximum, int expected) =>
        Assert.Equal(expected,
            PortalMistakeDamageRules.CalculateDamage(current, maximum));

    [Theory]
    [InlineData(-1, 20)]
    [InlineData(21, 20)]
    [InlineData(1, -1)]
    public void CorruptedHealth_IsRejected(int current, int maximum) =>
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            PortalMistakeDamageRules.CalculateDamage(current, maximum));
}
