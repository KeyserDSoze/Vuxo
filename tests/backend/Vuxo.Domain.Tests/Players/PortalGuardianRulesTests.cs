using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class PortalGuardianRulesTests
{
    [Theory]
    [InlineData(0L, 6, 2)]
    [InlineData(1L, 7, 3)]
    [InlineData(2L, 8, 4)]
    [InlineData(-1L, 8, 4)]
    [InlineData(long.MinValue, 7, 3)]
    public void SeedGivesDeterministicBoundedGuardian(long seed, int hp, int speed)
    {
        Assert.Equal(hp, PortalGuardianRules.GuardianMaxHealth(seed));
        Assert.Equal(speed, PortalGuardianRules.GuardianSpeed(seed));
    }

    [Fact]
    public void StrikeVersusGuardianGuard_AndGuardVersusStrike_ResolveWithoutClientDamage()
    {
        var strike = PortalGuardianRules.Resolve(4242, 1,
            PortalGuardianRules.Strike, 2, 2, 20, 20, 6, 6);
        Assert.Equal(PortalGuardianRules.Guard, strike.GuardianAction);
        Assert.Equal(1, strike.DamageDealt);
        Assert.Equal(0, strike.DamageTaken);
        Assert.Equal(5, strike.GuardianHealth);
        Assert.Equal(PortalGuardianRules.Ongoing, strike.Outcome);

        var parry = PortalGuardianRules.Resolve(4242, 2,
            PortalGuardianRules.Guard, 2, 2, 20, 20, 6, 6);
        Assert.Equal(PortalGuardianRules.Strike, parry.GuardianAction);
        Assert.Equal(1, parry.DamageDealt);
        Assert.Equal(0, parry.DamageTaken);
    }

    [Fact]
    public void DexterityDeterminesLethalStrikePriority()
    {
        var fast = PortalGuardianRules.Resolve(0, 2,
            PortalGuardianRules.Strike, 3, 2, 20, 20, 2, 6);
        var slow = PortalGuardianRules.Resolve(0, 2,
            PortalGuardianRules.Strike, 3, 1, 20, 20, 2, 6);
        Assert.Equal(PortalGuardianRules.Victory, fast.Outcome);
        Assert.Equal(0, fast.DamageTaken);
        Assert.Equal(2, slow.DamageTaken);
        Assert.Equal(PortalGuardianRules.Victory, slow.Outcome);
    }

    [Theory]
    [InlineData(2, 1, PortalGuardianRules.Retreat)]
    [InlineData(3, 1, PortalGuardianRules.Retreat)]
    [InlineData(4, 2, PortalGuardianRules.Ongoing)]
    [InlineData(20, 18, PortalGuardianRules.Ongoing)]
    public void RetaliationNeverDropsBelowOneHp(int hp, int expected, string outcome)
    {
        var result = PortalGuardianRules.Resolve(0, 2, PortalGuardianRules.Strike,
            2, 0, hp, 20, 6, 6);
        Assert.Equal(expected, result.PlayerHealth);
        Assert.Equal(outcome, result.Outcome);
    }

    [Fact]
    public void TurnCapTerminatesEvenAnAllGuardStalemate()
    {
        var result = PortalGuardianRules.Resolve(0, PortalGuardianRules.MaximumTurns,
            PortalGuardianRules.Guard, 2, 0, 20, 20, 6, 6);
        Assert.Equal(PortalGuardianRules.Retreat, result.Outcome);
        Assert.Equal(0, result.DamageTaken);
    }

    [Theory]
    [InlineData("heal")]
    [InlineData("victory")]
    [InlineData("")]
    public void UnsupportedActionsAreRejected(string action)
    {
        Assert.False(PortalGuardianRules.IsAction(action));
        Assert.Throws<ArgumentException>(() => PortalGuardianRules.Resolve(
            0, 1, action, 2, 2, 20, 20, 6, 6));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    [InlineData(-1)]
    public void InvalidTurnIsRejected(int turn) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => PortalGuardianRules.Resolve(
            0, turn, PortalGuardianRules.Strike, 2, 2, 20, 20, 6, 6));
}
