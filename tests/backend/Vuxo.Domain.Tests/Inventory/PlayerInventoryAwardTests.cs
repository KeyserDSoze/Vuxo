using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;

namespace Vuxo.Domain.Tests.Inventory;

public sealed class PlayerInventoryAwardTests
{
    [Theory]
    [InlineData(InventoryItemCatalog.RuneShard)]
    [InlineData(InventoryItemCatalog.GroveSeed)]
    [InlineData(InventoryItemCatalog.TidalPearl)]
    [InlineData(InventoryItemCatalog.SwiftFeather)]
    public void CanonicalAward_UsesGrantAsStableIdempotencyKey(string rewardKey)
    {
        var grant = CreateGrant(rewardKey);
        var time = new DateTimeOffset(2026, 11, 4, 13, 0, 0, TimeSpan.Zero);
        Assert.True(grant.TryConsume(time));
        var consumedEventId = Guid.NewGuid();
        var awardEventId = Guid.NewGuid();

        var award = PlayerInventoryAward.FromConsumedGrant(grant, consumedEventId, awardEventId, time);
        Assert.Equal(grant.Id, award.GrantId);
        Assert.Equal(grant.PlayerId, award.PlayerId);
        Assert.Equal(rewardKey, award.ItemKey);
        Assert.Equal(grant.CorrelationId, award.CorrelationId);
        Assert.Equal(consumedEventId, award.CausationId);
        Assert.Equal(awardEventId, award.AwardEventId);
        Assert.Equal(1, PlayerInventoryAward.Quantity);
    }

    [Theory]
    [InlineData("reward-reference")]
    [InlineData("legacy.unknown")]
    [InlineData("item.fake.v1")]
    [InlineData("")]
    public void Catalog_DoesNotInventLegacyOrForgedItems(string key)
    {
        Assert.False(InventoryItemCatalog.IsSupported(key));
        var grant = CreateGrant(key == "" ? "legacy.reward" : key);
        Assert.True(grant.TryConsume(DateTimeOffset.UtcNow));
        Assert.Throws<ArgumentException>(() =>
            PlayerInventoryAward.FromConsumedGrant(grant, Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Award_RejectsUnconsumedGrantAndInvalidCausation()
    {
        var grant = CreateGrant(InventoryItemCatalog.RuneShard);
        Assert.Throws<InvalidOperationException>(() =>
            PlayerInventoryAward.FromConsumedGrant(grant, Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow));
        Assert.True(grant.TryConsume(DateTimeOffset.UtcNow));
        Assert.Throws<ArgumentException>(() =>
            PlayerInventoryAward.FromConsumedGrant(grant, Guid.Empty, Guid.NewGuid(), DateTimeOffset.UtcNow));
    }

    private static ExclusiveContentGrant CreateGrant(string key)
        => ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a",
            "content.grove", PortalSequenceRules.PortalKey, "dialog.grove",
            key, 42L, "personal-content-v1",
            Guid.NewGuid(), null, DateTimeOffset.UtcNow.AddMinutes(-5),
            DateTimeOffset.UtcNow.AddHours(1));
}
