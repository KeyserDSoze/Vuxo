using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Application.PersonalContent;

namespace Vuxo.Api.Tests.PersonalContent;

public sealed class PortalOutcomeHistoryApiTests
{
    private const string Route = "/api/personal-content/history/outcomes";

    [Fact]
    public async Task AnonymousRequests_AreUnauthorizedAndCannotReadPrivateReceipts()
    {
        var history = new FakeReader();
        using var factory = CreateFactory(history);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Route);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, history.Calls);
    }

    [Fact]
    public async Task ReturnsOnlyJwtOwnerReceipts_WithoutSecretsOrOtherOwnerFields()
    {
        var history = new FakeReader();
        history.Rows.Add(("player-a", Event(1, PortalOutcomeKinds.SequenceCompleted) with { RewardItemKey = "item.rune_shard.v1" }));
        history.Rows.Add(("player-b", Event(2, PortalOutcomeKinds.GuardianRetreat)));
        using var factory = CreateFactory(history);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var response = await client.GetAsync(Route);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("player-a", history.LastOwner);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var item = Assert.Single(json.RootElement.GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal("sequence_completed", item.GetProperty("kind").GetString());
        Assert.Equal("item.rune_shard.v1", item.GetProperty("rewardItemKey").GetString());
        Assert.Equal(Id(1), item.GetProperty("eventId").GetGuid());
        Assert.False(item.TryGetProperty("seed", out _));
        Assert.False(item.TryGetProperty("rewardKey", out _));
        Assert.False(item.TryGetProperty("playerId", out _));
        Assert.False(item.TryGetProperty("answer", out _));
        Assert.False(json.RootElement.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public async Task ProvidesDeterministicPages_AndKeepsDistinctPvEOutcomes()
    {
        var history = new FakeReader();
        history.Rows.AddRange([
            ("player-a", Event(1, PortalOutcomeKinds.SequenceFirstMistake)),
            ("player-a", Event(2, PortalOutcomeKinds.GuardianRetreat)),
            ("player-a", Event(3, PortalOutcomeKinds.GuardianVictory)),
            ("player-b", Event(4, PortalOutcomeKinds.SequenceCompleted))
        ]);
        using var factory = CreateFactory(history);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var first = await client.GetFromJsonAsync<PortalOutcomeHistoryPage>(
            Route + "?page=1&pageSize=2");
        var next = await client.GetFromJsonAsync<PortalOutcomeHistoryPage>(
            Route + "?page=2&pageSize=2");

        Assert.NotNull(first);
        Assert.NotNull(next);
        Assert.Equal(2, first.Items.Count);
        Assert.True(first.HasMore);
        Assert.Equal(PortalOutcomeKinds.GuardianVictory, first.Items[0].Kind);
        Assert.Equal(PortalOutcomeKinds.GuardianRetreat, first.Items[1].Kind);
        Assert.Equal(PortalOutcomeKinds.SequenceFirstMistake, Assert.Single(next.Items).Kind);
        Assert.False(next.HasMore);
        Assert.Equal(2, history.Calls);
        Assert.Equal("player-a", history.LastOwner);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?page=-1")]
    [InlineData("?page=1001")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=51")]
    [InlineData("?pageSize=-1")]
    public async Task RejectsBadOrUnboundedPaging_BeforeDatabaseRead(string query)
    {
        var history = new FakeReader();
        using var factory = CreateFactory(history);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var response = await client.GetAsync(Route + query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, history.Calls);
    }


    [Fact]
    public async Task Outcomes_CursorContinuesFromLastOwnerEventDespiteAnotherDeviceNewHead()
    {
        var reader = new FakeReader();
        reader.Rows.AddRange([
            ("player-a", Event(1, PortalOutcomeKinds.SequenceFirstMistake)),
            ("player-a", Event(2, PortalOutcomeKinds.GuardianRetreat)),
            ("player-a", Event(3, PortalOutcomeKinds.SequenceCompleted)),
            ("player-b", Event(5, PortalOutcomeKinds.GuardianVictory))
        ]);
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var first = await client.GetFromJsonAsync<PortalOutcomeHistoryPage>(
            Route + "?page=1&pageSize=1");
        Assert.NotNull(first);
        Assert.Equal(Id(3), Assert.Single(first.Items).EventId);
        Assert.NotNull(first.NextCursor);

        reader.Rows.Add(("player-a", Event(4, PortalOutcomeKinds.GuardianVictory)));
        var second = await client.GetFromJsonAsync<PortalOutcomeHistoryPage>(
            Route + $"?page=2&pageSize=1&cursor={first.NextCursor}");
        Assert.NotNull(second);
        Assert.Equal(Id(2), Assert.Single(second.Items).EventId);
        Assert.Equal(first.NextCursor, reader.LastCursor);
        Assert.Equal("player-a", reader.LastOwner);
        Assert.NotEqual(Id(3), second.Items[0].EventId);
    }

    [Theory]
    [InlineData("?page=2&cursor=malformed")]
    [InlineData("?page=1&cursor=malformed")]
    public async Task Outcomes_RejectMalformedCursorWithoutReaderCalls(string query)
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");
        var response = await client.GetAsync(Route + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.Calls);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("portal_history_invalid_cursor",
            json.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Outcomes_RejectCursorOnFirstPage()
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");
        var cursor = PortalHistoryCursor.Encode(Event(1, PortalOutcomeKinds.GuardianVictory)
            .OccurredAtUtc, Id(1));
        var response = await client.GetAsync(Route + $"?page=1&cursor={cursor}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.Calls);
    }

    private static VuxoApiFactory CreateFactory(FakeReader reader) =>
        new(configureServices: services =>
        {
            services.RemoveAll<IPortalOutcomeHistoryReader>();
            services.AddSingleton<IPortalOutcomeHistoryReader>(reader);
        });

    private static async Task SignInAsync(HttpClient client, string subject)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject, displayName = subject, role = "User"
        });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Missing test token");
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    private static Guid Id(int value) => Guid.Parse(
        $"00000000-0000-4000-8000-{value:D12}");

    private static PortalOutcomeHistoryItem Event(int value, string kind) => new(
        Id(value), Id(value + 100), "portal.memory.grove", kind,
        "personal-content-v1", new DateTimeOffset(2026, 11, value, 10, 0, 0, TimeSpan.Zero));

    private sealed class FakeReader : IPortalOutcomeHistoryReader
    {
        public List<(string Owner, PortalOutcomeHistoryItem Item)> Rows { get; } = [];
        public int Calls { get; private set; }
        public string? LastCursor { get; private set; }
        public string? LastOwner { get; private set; }

        public Task<PortalOutcomeHistoryPage> ListForPlayerAsync(
            string playerId, int page, int pageSize,
            CancellationToken cancellationToken = default, string? cursor = null)
        {
            Calls++;
            LastOwner = playerId;
            LastCursor = cursor;
            var records = Rows.Where(row => row.Owner == playerId).Select(row => row.Item);
            if (cursor is not null)
            {
                var after = PortalHistoryCursor.Decode(cursor);
                records = records.Where(item => item.OccurredAtUtc < after.OccurredAtUtc ||
                    item.OccurredAtUtc == after.OccurredAtUtc &&
                    item.EventId.CompareTo(after.PublicId) < 0);
            }
            var rows = records.OrderByDescending(row => row.OccurredAtUtc)
                .ThenByDescending(row => row.EventId)
                .Skip(cursor is null ? (page - 1) * pageSize : 0)
                .Take(pageSize + 1)
                .ToArray();
            var visible = rows.Take(pageSize).ToArray();
            var hasMore = rows.Length > pageSize;
            return Task.FromResult(new PortalOutcomeHistoryPage(
                visible, page, pageSize, hasMore, hasMore
                    ? PortalHistoryCursor.Encode(visible[^1].OccurredAtUtc, visible[^1].EventId) : null));
        }
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
}
