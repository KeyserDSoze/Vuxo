using Vuxo.Domain.PersonalContent;

namespace Vuxo.Domain.Tests.PersonalContent;

public sealed class WorldPortalPlacementRulesTests
{
    private static readonly Guid GrantId = Guid.Parse("11111111-2222-4333-8444-555555555555");

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(-42)]
    [InlineData(long.MaxValue)]
    [InlineData(long.MinValue)]
    public void Choose_ReturnsSameWalkablePointForSameGrantSeedAndRules(long seed)
    {
        var candidates = Enumerable.Range(0, 30)
            .Select(x => new PortalWorldPoint(x + .5d, 4.5d)).ToArray();

        var first = WorldPortalPlacementRules.Choose(GrantId, seed, candidates);
        Assert.Equal(first, WorldPortalPlacementRules.Choose(GrantId, seed, candidates));
        Assert.Contains(first, candidates);
        Assert.Equal("world-personal-portal-v1", WorldPortalPlacementRules.Version);
    }

    [Fact]
    public void Choose_ChangesWithDifferentSeedsAndGrantIds()
    {
        var candidates = Enumerable.Range(0, 30)
            .Select(x => new PortalWorldPoint(x + .5d, 4.5d)).ToArray();
        var positions = Enumerable.Range(0, 40)
            .Select(seed => WorldPortalPlacementRules.Choose(GrantId, seed, candidates))
            .Distinct().Count();

        Assert.True(positions > 1);
        Assert.NotEqual(Guid.Empty, GrantId);
    }

    [Theory]
    [InlineData(0, 0, 0, 0, true)]
    [InlineData(0, 0, 1.5, 0, true)]
    [InlineData(0, 0, 1.501, 0, false)]
    [InlineData(0, 0, 1, 1, true)]
    [InlineData(0, 0, 1.1, 1.1, false)]
    public void CanEnter_UsesInclusiveEuclideanRadius(
        double playerX, double playerY, double portalX, double portalY, bool expected)
    {
        Assert.Equal(expected, WorldPortalPlacementRules.CanEnter(
            new PortalWorldPoint(playerX, playerY),
            new PortalWorldPoint(portalX, portalY)));
    }

    [Fact]
    public void CanEnter_RejectsNonFinitePositions()
    {
        Assert.False(WorldPortalPlacementRules.CanEnter(
            new PortalWorldPoint(double.NaN, 0),
            new PortalWorldPoint(0, 0)));
        Assert.False(WorldPortalPlacementRules.CanEnter(
            new PortalWorldPoint(0, double.PositiveInfinity),
            new PortalWorldPoint(0, 0)));
        Assert.False(WorldPortalPlacementRules.CanEnter(
            new PortalWorldPoint(0, 0),
            new PortalWorldPoint(double.NegativeInfinity, 0)));
    }

    [Fact]
    public void Choose_RejectsMissingIdentityOrCandidates()
    {
        Assert.Throws<ArgumentException>(() =>
            WorldPortalPlacementRules.Choose(Guid.Empty, 0, [new PortalWorldPoint(.5, .5)]));
        Assert.Throws<ArgumentException>(() =>
            WorldPortalPlacementRules.Choose(GrantId, 0, []));
    }
}
