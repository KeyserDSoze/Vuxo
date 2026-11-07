using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Application.PersonalContent;

namespace Vuxo.Api.Tests.PersonalContent;

public sealed class PortalCompletionHistoryApiTests
{
    private const string Path = "/api/personal-content/history/completed";

    [Fact]
    public async Task History_RequiresAuthentication_BeforeQueryingAnyPlayerData()
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.Reads);
    }

    [Fact]
    public async Task History_UsesJwtSubjectAndReturnsOnlySafeCompletedFields()
    {
        var reader = new FakeReader();
        reader.Records.Add(("player-a", NewCompletion(1) with { RewardItemKey = "item.grove_seed.v1" }));
        reader.Records.Add(("player-b", NewCompletion(2)));
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.GetAsync(Path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("player-a", reader.LastOwner);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        var entry = Assert.Single(root.GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal(NewId(1), entry.GetProperty("grantId").GetGuid());
        Assert.Equal("portal.memory.grove", entry.GetProperty("contentKey").GetString());
        Assert.Equal("item.grove_seed.v1", entry.GetProperty("rewardItemKey").GetString());
        Assert.Equal("personal-content-v1", entry.GetProperty("ruleVersion").GetString());
        Assert.True(entry.TryGetProperty("completedAtUtc", out _));
        Assert.True(entry.TryGetProperty("grantedAtUtc", out _));
        Assert.False(entry.TryGetProperty("seed", out _));
        Assert.False(entry.TryGetProperty("rewardKey", out _));
        Assert.False(entry.TryGetProperty("playerId", out _));
        Assert.False(entry.TryGetProperty("correlationId", out _));
        Assert.False(root.GetProperty("hasMore").GetBoolean());
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.Equal(20, root.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task History_PaginatesPredictably_AndDoesNotLeakOtherOwners()
    {
        var reader = new FakeReader();
        reader.Records.AddRange([
            ("player-a", NewCompletion(1)),
            ("player-a", NewCompletion(2)),
            ("player-a", NewCompletion(3)),
            ("player-b", NewCompletion(4))
        ]);
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var first = await client.GetFromJsonAsync<PortalCompletionHistoryPage>(
            Path + "?page=1&pageSize=2");
        var second = await client.GetFromJsonAsync<PortalCompletionHistoryPage>(
            Path + "?page=2&pageSize=2");

        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.Equal(2, first.Items.Count);
        Assert.True(first.HasMore);
        Assert.Equal(1, second.Items.Count);
        Assert.False(second.HasMore);
        Assert.Equal([NewId(3), NewId(2)], first.Items.Select(x => x.GrantId));
        Assert.Equal(NewId(1), Assert.Single(second.Items).GrantId);
        Assert.Equal("player-a", reader.LastOwner);
        Assert.Equal(2, reader.Reads);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?page=-1")]
    [InlineData("?page=1001")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=51")]
    [InlineData("?pageSize=-4")]
    public async Task History_RejectsUnboundedOrInvalidPageParameters(string query)
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.GetAsync(Path + query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.Reads);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("portal_history_invalid_pagination", json.RootElement.GetProperty("code").GetString());
    }


    [Fact]
    public async Task History_CursorIsOwnerScopedAndStableWhenNewEventIsAddedAtTheHead()
    {
        var reader = new FakeReader();
        reader.Records.AddRange([
            ("player-a", NewCompletion(1)), ("player-a", NewCompletion(2)),
            ("player-a", NewCompletion(3)), ("player-b", NewCompletion(5))
        ]);
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var first = await client.GetFromJsonAsync<PortalCompletionHistoryPage>(
            Path + "?page=1&pageSize=1");
        Assert.NotNull(first);
        Assert.Equal(NewId(3), Assert.Single(first.Items).GrantId);
        Assert.NotNull(first.NextCursor);

        reader.Records.Add(("player-a", NewCompletion(4))); // other device inserts a new head
        var second = await client.GetFromJsonAsync<PortalCompletionHistoryPage>(
            Path + $"?page=2&pageSize=1&cursor={first.NextCursor}");
        Assert.NotNull(second);
        Assert.Equal(NewId(2), Assert.Single(second.Items).GrantId);
        Assert.Equal(first.NextCursor, reader.LastCursor);
        Assert.Equal("player-a", reader.LastOwner);
        Assert.NotEqual(NewId(3), second.Items[0].GrantId);
    }

    [Theory]
    [InlineData("?page=2&cursor=malformed")]
    [InlineData("?page=1&cursor=malformed")]
    public async Task History_RejectsMalformedCursorWithoutAccessingReader(string query)
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.GetAsync(Path + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.Reads);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("portal_history_invalid_cursor",
            json.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task History_RejectsCursorOnFirstPage()
    {
        var reader = new FakeReader();
        using var factory = CreateFactory(reader);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        var cursor = PortalHistoryCursor.Encode(NewCompletion(1).CompletedAtUtc, NewId(1));
        var response = await client.GetAsync(Path + $"?page=1&cursor={cursor}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.Reads);
    }

    private static VuxoApiFactory CreateFactory(FakeReader reader) =>
        new(configureServices: services =>
        {
            services.RemoveAll<IPortalCompletionHistoryReader>();
            services.AddSingleton<IPortalCompletionHistoryReader>(reader);
        });

    private static async Task AuthenticateAsync(HttpClient client, string subject)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = subject,
            role = "User"
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("No mock token received.");
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", payload.AccessToken);
    }

    private static Guid NewId(int index) => Guid.Parse(
        $"00000000-0000-4000-8000-{index:D12}");

    private static PortalCompletionHistoryItem NewCompletion(int index) => new(
        NewId(index), "portal.memory.grove", "personal-content-v1",
        new DateTimeOffset(2026, 11, 1, 10, 0, 0, TimeSpan.Zero),
        new DateTimeOffset(2026, 11, index, 10, 0, 0, TimeSpan.Zero));

    private sealed class FakeReader : IPortalCompletionHistoryReader
    {
        public readonly List<(string Owner, PortalCompletionHistoryItem Item)> Records = [];
        public string? LastOwner { get; private set; }
        public int Reads { get; private set; }
        public string? LastCursor { get; private set; }

        public Task<PortalCompletionHistoryPage> ListCompletedForPlayerAsync(
            string playerId, int page, int pageSize,
            CancellationToken cancellationToken = default, string? cursor = null)
        {
            Reads++;
            LastOwner = playerId;
            LastCursor = cursor;
            var records = Records.Where(x => x.Owner == playerId).Select(x => x.Item);
            if (cursor is not null)
            {
                var after = PortalHistoryCursor.Decode(cursor);
                records = records.Where(item => item.CompletedAtUtc < after.OccurredAtUtc ||
                    item.CompletedAtUtc == after.OccurredAtUtc &&
                    item.GrantId.CompareTo(after.PublicId) < 0);
            }
            var result = records.OrderByDescending(x => x.CompletedAtUtc)
                .ThenByDescending(x => x.GrantId)
                .Skip(cursor is null ? (page - 1) * pageSize : 0)
                .Take(pageSize + 1)
                .ToArray();
            var visible = result.Take(pageSize).ToArray();
            var hasMore = result.Length > pageSize;
            return Task.FromResult(new PortalCompletionHistoryPage(
                visible, page, pageSize, hasMore, hasMore
                    ? PortalHistoryCursor.Encode(visible[^1].CompletedAtUtc, visible[^1].GrantId) : null));
        }
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
}
