using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class GameEventStoreTests
{
    private static readonly DateTimeOffset BaseTime = new(2026, 9, 16, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task QueryAsync_AppliesPlayerTypeCorrelationAndTimeFilters()
    {
        await using var db = CreateDbContext();
        var targetCorrelation = Guid.NewGuid();
        var expected = CreateEntity(
            "player-a",
            "exclusive_content.granted",
            targetCorrelation,
            BaseTime.AddMinutes(10));

        db.GameEvents.AddRange(
            expected,
            CreateEntity("player-b", "exclusive_content.granted", targetCorrelation, BaseTime.AddMinutes(10)),
            CreateEntity("player-a", "exclusive_content.consumed", targetCorrelation, BaseTime.AddMinutes(10)),
            CreateEntity("player-a", "exclusive_content.granted", Guid.NewGuid(), BaseTime.AddMinutes(10)),
            CreateEntity("player-a", "exclusive_content.granted", targetCorrelation, BaseTime.AddHours(-1)));
        await db.SaveChangesAsync();

        var store = new GameEventStore(db);
        var page = await store.QueryAsync(new GameEventQuery(
            PlayerId: " player-a ",
            EventType: " exclusive_content.granted ",
            CorrelationId: targetCorrelation,
            FromUtc: BaseTime,
            ToUtc: BaseTime.AddMinutes(30),
            Offset: 0,
            Limit: 20));

        var item = Assert.Single(page.Items);
        Assert.Equal(expected.EventId, item.Envelope.EventId);
        Assert.Equal(1, page.Total);
        Assert.Equal(0, page.Offset);
        Assert.Equal(20, page.Limit);
    }

    [Fact]
    public async Task QueryAsync_UsesStableDescendingOrderAndPagination()
    {
        await using var db = CreateDbContext();
        var oldest = CreateEntity("player-a", "evt", Guid.NewGuid(), BaseTime.AddMinutes(1));
        var middle = CreateEntity("player-a", "evt", Guid.NewGuid(), BaseTime.AddMinutes(2));
        var newest = CreateEntity("player-a", "evt", Guid.NewGuid(), BaseTime.AddMinutes(3));
        db.GameEvents.AddRange(oldest, middle, newest);
        await db.SaveChangesAsync();

        var store = new GameEventStore(db);
        var page = await store.QueryAsync(new GameEventQuery(Offset: 1, Limit: 1));

        var item = Assert.Single(page.Items);
        Assert.Equal(middle.EventId, item.Envelope.EventId);
        Assert.Equal(3, page.Total);
        Assert.Equal(1, page.Offset);
        Assert.Equal(1, page.Limit);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsEnvelopeAndEquivalentPayload()
    {
        await using var db = CreateDbContext();
        var entity = CreateEntity("player-a", "evt.detail", Guid.NewGuid(), BaseTime);
        entity.PayloadJson = "{\"schemaVersion\":1,\"kind\":\"evt.detail\",\"data\":{\"value\":7}}";
        db.GameEvents.Add(entity);
        await db.SaveChangesAsync();

        var store = new GameEventStore(db);
        var result = await store.GetByIdAsync(entity.EventId);

        Assert.NotNull(result);
        Assert.Equal(entity.EventId, result.Envelope.EventId);
        Assert.Equal(entity.EventType, result.Envelope.EventType);
        AssertJsonEquivalent(entity.PayloadJson, result.PayloadJson);
    }

    internal static void AssertJsonEquivalent(string expected, string actual)
    {
        var expectedNode = JsonNode.Parse(expected);
        var actualNode = JsonNode.Parse(actual);
        Assert.True(JsonNode.DeepEquals(expectedNode, actualNode), $"Expected JSON equivalent to {expected}, actual {actual}.");
    }

    private static VuxoDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseInMemoryDatabase($"audit-{Guid.NewGuid():N}")
            .Options;
        return new VuxoDbContext(options);
    }

    private static GameEventEntity CreateEntity(
        string? playerId,
        string eventType,
        Guid correlationId,
        DateTimeOffset occurredAtUtc) => new()
    {
        EventId = Guid.NewGuid(),
        EventType = eventType,
        VisibilityScope = (int)GameEventVisibilityScope.Player,
        PlayerId = playerId,
        CorrelationId = correlationId,
        CausationId = Guid.NewGuid(),
        RuleVersion = "rules-v1",
        OccurredAtUtc = occurredAtUtc,
        PayloadJson = "{\"schemaVersion\":1,\"kind\":\"test\",\"data\":{}}"
    };
}
