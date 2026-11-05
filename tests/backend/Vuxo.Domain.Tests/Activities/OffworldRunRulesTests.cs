using Vuxo.Domain.Activities;

namespace Vuxo.Domain.Tests.Activities;

public sealed class OffworldRunRulesTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 11, 5, 15, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(11)]
    public void RunLimits_AllowStartsBeforeDailyMaximum(int starts)
    {
        OffworldRunRules.ValidateStart(Now, Now.AddMinutes(-3), starts);
    }

    [Fact]
    public void RunLimits_RejectTwelfthAlreadyStarted()
    {
        var error = Assert.Throws<OffworldRunException>(() =>
            OffworldRunRules.ValidateStart(Now, Now.AddHours(-1), 12));
        Assert.Equal(OffworldRunErrorCodes.DailyLimit, error.Code);
    }

    [Fact]
    public void Cooldown_UsesServerUtcBoundary()
    {
        var latest = Now.AddMinutes(-1);
        var error = Assert.Throws<OffworldRunException>(() =>
            OffworldRunRules.ValidateStart(Now, latest, 1));
        Assert.Equal(OffworldRunErrorCodes.Cooldown, error.Code);
        Assert.Equal(Now.AddMinutes(1), error.NextAllowedAtUtc);
        OffworldRunRules.ValidateStart(Now.AddMinutes(1), latest, 1);
    }

    [Fact]
    public void Expiration_IsInclusiveAndCompletedReceiptsRemainCompleted()
    {
        var expiry = Now.Add(OffworldRunRules.Lifetime);
        Assert.Equal(OffworldRunRules.Active,
            OffworldRunRules.CurrentState(OffworldRunRules.Active, expiry, Now));
        Assert.Equal(OffworldRunRules.Expired,
            OffworldRunRules.CurrentState(OffworldRunRules.Active, expiry, expiry));
        Assert.Equal(OffworldRunRules.Completed,
            OffworldRunRules.CurrentState(OffworldRunRules.Completed, expiry, expiry.AddDays(5)));
    }
}
