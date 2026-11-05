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
    [InlineData(4242L, 1, 2, 2, 0, 4)] // Guardian guards; low Dexterity
    [InlineData(4242L, 1, 3, 3, 0, 3)] // Fast Feint punches through Guard
    [InlineData(0L, 2, 2, 0, 1, 6)] // Guardian strikes; Feint avoids most damage
    public void FeintV2_UsesServerSeedSpeedAndEnemyCard(
        long seed, int turn, int dexterity, int dealt, int taken, int enemyAfter)
    {
        var resolved = PortalGuardianRules.Resolve(seed, turn,
            PortalGuardianRules.Feint, 2, dexterity, 20, 20, 6, 6,
            PortalGuardianRules.CurrentVersion);
        Assert.Equal(dealt, resolved.DamageDealt);
        Assert.Equal(taken, resolved.DamageTaken);
        Assert.Equal(enemyAfter, resolved.GuardianHealth);
        Assert.Equal(20 - taken, resolved.PlayerHealth);
    }

    [Fact]
    public void ExistingV1RulesRejectFeint_WithoutChangingStrikeOrGuard()
    {
        Assert.True(PortalGuardianRules.IsAction(PortalGuardianRules.Feint));
        Assert.False(PortalGuardianRules.IsActionForVersion(
            PortalGuardianRules.Feint, PortalGuardianRules.Version));
        Assert.True(PortalGuardianRules.IsActionForVersion(
            PortalGuardianRules.Feint, PortalGuardianRules.CurrentVersion));
        Assert.Throws<ArgumentException>(() => PortalGuardianRules.Resolve(
            4242, 1, PortalGuardianRules.Feint, 2, 3, 20, 20, 6, 6));
        var oldRule = PortalGuardianRules.Resolve(
            4242, 1, PortalGuardianRules.Strike, 2, 3, 20, 20, 6, 6);
        var newRule = PortalGuardianRules.Resolve(
            4242, 1, PortalGuardianRules.Strike, 2, 3, 20, 20, 6, 6,
            PortalGuardianRules.CurrentVersion);
        Assert.Equal(oldRule, newRule);
        Assert.False(PortalGuardianRules.IsActionForVersion(
            PortalGuardianRules.Strike, "portal-guardian-showdown-v999"));
        Assert.Throws<ArgumentException>(() => PortalGuardianRules.Resolve(
            4242, 1, PortalGuardianRules.Strike, 2, 3, 20, 20, 6, 6,
            "portal-guardian-showdown-v999"));
    }

    [Fact]
    public void FeintV2_DamageClampsToGuardianHpAndPlayerHp()
    {
        var lethal = PortalGuardianRules.Resolve(4242, 1,
            PortalGuardianRules.Feint, 0, 3, 20, 20, 2, 6,
            PortalGuardianRules.CurrentVersion);
        Assert.Equal(2, lethal.DamageDealt);
        Assert.Equal(0, lethal.GuardianHealth);
        Assert.Equal(PortalGuardianRules.Victory, lethal.Outcome);

        var hurt = PortalGuardianRules.Resolve(0, 2,
            PortalGuardianRules.Feint, 0, 0, 2, 20, 6, 6,
            PortalGuardianRules.CurrentVersion);
        Assert.Equal(1, hurt.PlayerHealth);
        Assert.Equal(PortalGuardianRules.Retreat, hurt.Outcome);
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
