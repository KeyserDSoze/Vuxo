using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Xunit;

namespace Vuxo.Application.Tests.Events;

public sealed class GameEventAuditServiceTests
{
    [Fact]
    public async Task QueryAsync_NormalizesFiltersAndForwardsPagination()
    {
        var store = new FakeStore();
        var service = new GameEventAuditService(store);
        var correlationId = Guid.NewGuid();
        var from = DateTimeOffset.UtcNow.AddHours(-1);
        var to = DateTimeOffset.UtcNow;

        await service.QueryAsync(
            " player-a ",
            " event.type ",
            correlationId,
            from,
            to,
            25,
            10);

        Assert.NotNull(store.LastQuery);
        Assert.Equal("player-a", store.LastQuery.PlayerId);
        Assert.Equal("event.type", store.LastQuery.EventType);
        Assert.Equal(correlationId, store.LastQuery.CorrelationId);
        Assert.Equal(from, store.LastQuery.FromUtc);
        Assert.Equal(to, store.LastQuery.ToUtc);
        Assert.Equal(25, store.LastQuery.Offset);
        Assert.Equal(10, store.LastQuery.Limit);
    }

    [Theory]
    [InlineData(-1, 10)]
    [InlineData(0, 0)]
    [InlineData(0, 101)]
    public async Task QueryAsync_RejectsInvalidPagination(int offset, int limit)
    {
        var service = new GameEventAuditService(new FakeStore());

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => service.QueryAsync(
            null, null, null, null, null, offset, limit));
    }

    [Fact]
    public async Task QueryAsync_RejectsInvertedTimeRange()
    {
        var service = new GameEventAuditService(new FakeStore());
        var now = DateTimeOffset.UtcNow;

        await Assert.ThrowsAsync<ArgumentException>(() => service.QueryAsync(
            null, null, null, now, now.AddMinutes(-1), 0, 20));
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsRecordAndRejectsMissingEvent()
    {
        var store = new FakeStore();
        var eventId = Guid.NewGuid();
        store.ById[eventId] = Record(eventId);
        var service = new GameEventAuditService(store);

        var found = await service.GetByIdAsync(eventId);
        Assert.Equal(eventId, found.Envelope.EventId);

        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GetByIdAsync(Guid.NewGuid()));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GetByIdAsync(Guid.Empty));
    }

    private static GameEventRecord Record(Guid eventId) => new(
        new GameEventEnvelope(
            eventId,
            "test.event",
            GameEventVisibilityScope.Administration,
            null,
            Guid.NewGuid(),
            null,
            "rules-v1",
            DateTimeOffset.UtcNow),
        "{\"schemaVersion\":1,\"kind\":\"test.event\",\"data\":{}}");

    private sealed class FakeStore : IGameEventStore
    {
        public GameEventQuery? LastQuery { get; private set; }
        public Dictionary<Guid, GameEventRecord> ById { get; } = [];

        public Task AppendAsync(GameEventEnvelope envelope, string payloadJson, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();

        public Task<GameEventPage> QueryAsync(GameEventQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(new GameEventPage([], 0, query.Offset, query.Limit));
        }

        public Task<GameEventRecord?> GetByIdAsync(Guid eventId, CancellationToken cancellationToken = default)
            => Task.FromResult(ById.GetValueOrDefault(eventId));
    }
}
