using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class PortalEncounterRulesTests
{
    [Fact]
    public void LeaseIsActiveOnlyBeforeExpiryAndWhileGrantIsUnconsumed()
    {
        var start = new DateTimeOffset(2026, 11, 5, 10, 0, 0, TimeSpan.Zero);
        var expiry = start.Add(PortalEncounterRules.MaximumDuration);
        Assert.Equal(TimeSpan.FromMinutes(3), PortalEncounterRules.MaximumDuration);
        Assert.True(PortalEncounterRules.IsActive(start, expiry, null));
        Assert.True(PortalEncounterRules.IsActive(expiry.AddTicks(-1), expiry, null));
        Assert.False(PortalEncounterRules.IsActive(expiry, expiry, null));
        Assert.False(PortalEncounterRules.IsActive(expiry.AddMinutes(1), expiry, null));
        Assert.False(PortalEncounterRules.IsActive(start.AddSeconds(5),
            expiry, start.AddSeconds(4)));
    }
}
