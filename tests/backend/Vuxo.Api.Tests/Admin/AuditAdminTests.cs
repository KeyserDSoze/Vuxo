using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Application.Events;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Admin;

public sealed class AuditAdminTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 16, 14, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task AuditEndpoints_RequireAdministrator_NotUserOrGameMaster()
    {
        var personal = Record("exclusive_content.granted", "player-a", GameEventVisibilityScope.Player, Now);
        using var factory = CreateFactory([personal]);

        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/audit/events")).StatusCode);

        using var user = factory.CreateClient();
        await AuthenticateAsync(user, "user", "User");
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync($"/api/admin/audit/events/{personal.Envelope.EventId}")).StatusCode);

        using var gameMaster = factory.CreateClient();
        await AuthenticateAsync(gameMaster, "gm", "GameMaster");
        Assert.Equal(HttpStatusCode.Forbidden, (await gameMaster.GetAsync("/api/admin/audit/events")).StatusCode);

        using var administrator = factory.CreateClient();
        await AuthenticateAsync(administrator, "admin", "Administrator");
        Assert.Equal(HttpStatusCode.OK, (await administrator.GetAsync("/api/admin/audit/events")).StatusCode);
    }

    [Fact]
    public async Task EventList_AppliesFiltersAndPagination()
    {
        var correlation = Guid.NewGuid();
        var records = new[]
        {
            Record("exclusive_content.granted", "player-a", GameEventVisibilityScope.Player, Now.AddMinutes(-1), correlation),
            Record("exclusive_content.granted", "player-a", GameEventVisibilityScope.Player, Now.AddMinutes(-2), correlation),
            Record("exclusive_content.granted", "player-b", GameEventVisibilityScope.Player, Now.AddMinutes(-3), correlation),
            Record("exclusive_content.consumed", "player-a", GameEventVisibilityScope.Player, Now.AddMinutes(-4), correlation)
        };
        using var factory = CreateFactory(records);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin", "Administrator");

        var url = $"/api/admin/audit/events?playerId=player-a&eventType=exclusive_content.granted&correlationId={correlation}&offset=1&limit=1";
        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("total").GetInt32());
        Assert.Equal(1, root.GetProperty("offset").GetInt32());
        Assert.Equal(1, root.GetProperty("limit").GetInt32());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray().ToArray());
        Assert.Equal(records[1].Envelope.EventId, item.GetProperty("eventId").GetGuid());
        Assert.Equal("player", item.GetProperty("visibilityScope").GetString());
    }

    [Fact]
    public async Task EventDetail_ReturnsVersionedPayloadRuleAndCausality()
    {
        var causationId = Guid.NewGuid();
        var record = Record("exclusive_content.granted", "player-a", GameEventVisibilityScope.Player, Now, causationId: causationId);
        using var factory = CreateFactory([record]);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin", "Administrator");

        var response = await client.GetAsync($"/api/admin/audit/events/{record.Envelope.EventId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(record.Envelope.RuleVersion, root.GetProperty("ruleVersion").GetString());
        Assert.Equal(causationId, root.GetProperty("causationId").GetGuid());
        Assert.Equal(1, root.GetProperty("payload").GetProperty("schemaVersion").GetInt32());
        Assert.Equal("exclusive_content.granted", root.GetProperty("payload").GetProperty("kind").GetString());
        Assert.Equal("portal.grove.001", root.GetProperty("payload").GetProperty("data").GetProperty("contentKey").GetString());
    }

    [Fact]
    public async Task EventDetail_InvalidLegacyJson_IsWrappedWithoutBreakingAuditView()
    {
        var envelope = new GameEventEnvelope(
            Guid.NewGuid(), "legacy.event", GameEventVisibilityScope.Global, null,
            Guid.NewGuid(), null, "legacy-v1", Now);
        var record = new GameEventRecord(envelope, "not-json");
        using var factory = CreateFactory([record]);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin", "Administrator");

        var response = await client.GetAsync($"/api/admin/audit/events/{envelope.EventId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var payload = document.RootElement.GetProperty("payload");
        Assert.Equal(0, payload.GetProperty("schemaVersion").GetInt32());
        Assert.Equal("legacy.invalid-json", payload.GetProperty("kind").GetString());
        Assert.Equal("not-json", payload.GetProperty("data").GetProperty("raw").GetString());
    }

    [Fact]
    public async Task OnlinePlayers_ReturnsAuthoritativeSimulationSnapshot()
    {
        var simulation = new WorldSimulation(TimeProvider.System);
        var character = PlayerCharacter.Create(
            "player-online",
            "Online Vuxian",
            PlayerAttributes.Create(0, 2, 0, 8, 0, 0),
            new CharacterAppearance(
                "hair-1", "black", "face-1", "body-1", "skin-1",
                "blue", "bottom-1", "black", "shoe-1", "black"));
        simulation.Join("connection-online", "player-online", character, new WorldSpawnPoint(4.5, 7.25));

        using var factory = CreateFactory([], simulation);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin", "Administrator");

        var response = await client.GetAsync("/api/admin/online-players");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var player = Assert.Single(document.RootElement.GetProperty("players").EnumerateArray().ToArray());
        Assert.Equal("player-online", player.GetProperty("playerId").GetString());
        Assert.Equal("Online Vuxian", player.GetProperty("characterName").GetString());
        Assert.Equal(4.5, player.GetProperty("x").GetDouble(), 10);
        Assert.Equal(7.25, player.GetProperty("y").GetDouble(), 10);
    }

    [Fact]
    public async Task EventList_InvalidPagination_ReturnsBadRequest()
    {
        using var factory = CreateFactory([]);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin", "Administrator");

        var response = await client.GetAsync("/api/admin/audit/events?limit=101");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("audit_query_invalid", error?.Code);
    }

    private static VuxoApiFactory CreateFactory(
        IEnumerable<GameEventRecord> records,
        WorldSimulation? simulation = null)
    {
        var store = new FakeEventStore(records);
        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IGameEventStore>();
            services.AddSingleton<IGameEventStore>(store);
            if (simulation is not null)
            {
                services.RemoveAll<WorldSimulation>();
                services.AddSingleton(simulation);
            }
        });
    }

    private static GameEventRecord Record(
        string eventType,
        string? playerId,
        GameEventVisibilityScope visibility,
        DateTimeOffset occurredAt,
        Guid? correlationId = null,
        Guid? causationId = null)
    {
        var envelope = new GameEventEnvelope(
            Guid.NewGuid(),
            eventType,
            visibility,
            playerId,
            correlationId ?? Guid.NewGuid(),
            causationId,
            "personal-content-v1",
            occurredAt);
        var payload = GameEventPayloadSerializer.Serialize(eventType, new
        {
            contentKey = "portal.grove.001",
            playerId
        });
        return new GameEventRecord(envelope, payload);
    }

    private static async Task AuthenticateAsync(HttpClient client, string subject, string role)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = subject,
            role
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", payload.AccessToken);
    }

    private sealed class FakeEventStore(IEnumerable<GameEventRecord> records) : IGameEventStore
    {
        private readonly List<GameEventRecord> _records = records.ToList();

        public Task AppendAsync(GameEventEnvelope envelope, string payloadJson, CancellationToken cancellationToken = default)
        {
            _records.Add(new GameEventRecord(envelope, payloadJson));
            return Task.CompletedTask;
        }

        public Task<GameEventPage> QueryAsync(GameEventQuery query, CancellationToken cancellationToken = default)
        {
            IEnumerable<GameEventRecord> result = _records;
            if (query.PlayerId is not null) result = result.Where(x => x.Envelope.PlayerId == query.PlayerId);
            if (query.EventType is not null) result = result.Where(x => x.Envelope.EventType == query.EventType);
            if (query.CorrelationId is not null) result = result.Where(x => x.Envelope.CorrelationId == query.CorrelationId);
            if (query.FromUtc is not null) result = result.Where(x => x.Envelope.OccurredAtUtc >= query.FromUtc);
            if (query.ToUtc is not null) result = result.Where(x => x.Envelope.OccurredAtUtc <= query.ToUtc);
            var ordered = result
                .OrderByDescending(x => x.Envelope.OccurredAtUtc)
                .ThenByDescending(x => x.Envelope.EventId)
                .ToArray();
            var items = ordered.Skip(query.Offset).Take(query.Limit).ToArray();
            return Task.FromResult(new GameEventPage(items, ordered.Length, query.Offset, query.Limit));
        }

        public Task<GameEventRecord?> GetByIdAsync(Guid eventId, CancellationToken cancellationToken = default)
            => Task.FromResult(_records.SingleOrDefault(x => x.Envelope.EventId == eventId));
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
    private sealed record ErrorResponse(string Code);
}
