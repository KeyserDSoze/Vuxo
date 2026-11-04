using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Common;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Inventory;

namespace Vuxo.Api.Tests.PersonalContent;

public sealed class PersonalContentTests
{
    [Fact]
    public async Task List_RequiresAuthentication()
    {
        using var factory = CreateFactory(out _, out _, out _);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/personal-content");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task List_ReturnsOnlyAuthenticatedPlayersPayload_WithoutAuditMetadata()
    {
        var grantA = CreateGrant("player-a");
        var grantB = CreateGrant("player-b");
        using var factory = CreateFactory(out var repository, out _, out _);
        repository.Grants.AddRange([grantA, grantB]);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");

        var response = await client.GetAsync("/api/personal-content");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var item = Assert.Single(document.RootElement.EnumerateArray().ToArray());
        Assert.Equal(grantA.Id, item.GetProperty("id").GetGuid());
        Assert.Equal("portal-key", item.GetProperty("portalKey").GetString());
        Assert.Equal("dialog-key", item.GetProperty("dialogBranchKey").GetString());
        Assert.Equal("reward-key", item.GetProperty("rewardKey").GetString());
        Assert.False(item.TryGetProperty("seed", out _));
        Assert.False(item.TryGetProperty("sourceEventId", out _));
        Assert.False(item.TryGetProperty("correlationId", out _));
    }

    [Fact]
    public async Task Consume_KnownGrantOwnedByAnotherPlayer_ReturnsNotFoundWithoutMutation()
    {
        var grant = CreateGrant("player-a");
        using var factory = CreateFactory(out var repository, out var events, out var unitOfWork);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-b", "User");

        var response = await client.PostAsync($"/api/personal-content/{grant.Id}/consume", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("exclusive_content_not_found", error?.Code);
        Assert.False(grant.IsConsumed);
        Assert.Equal(0, repository.UpdateCalls);
        Assert.Empty(events.Appended);
        Assert.Equal(0, unitOfWork.SaveCalls);
    }

    [Fact]
    public async Task AdminGrant_RequiresGameMaster_AndCreatesPlayerScopedAuditEvent()
    {
        using var factory = CreateFactory(out var repository, out var events, out var unitOfWork);
        using var userClient = factory.CreateClient();
        await AuthenticateAsync(userClient, "ordinary-user", "User");
        var request = ValidGrantRequest("player-a");

        var forbidden = await userClient.PostAsJsonAsync("/api/admin/personal-content/grants", request);

        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Empty(repository.Grants);

        using var gameMasterClient = factory.CreateClient();
        await AuthenticateAsync(gameMasterClient, "gm-user", "GameMaster");
        var created = await gameMasterClient.PostAsJsonAsync("/api/admin/personal-content/grants", request);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var grant = Assert.Single(repository.Grants);
        Assert.Equal("player-a", grant.PlayerId);
        Assert.Equal(123456, grant.Seed);
        Assert.Equal(1, unitOfWork.SaveCalls);
        var appended = Assert.Single(events.Appended);
        Assert.Equal(GameEventVisibilityScope.Player, appended.Envelope.VisibilityScope);
        Assert.Equal("player-a", appended.Envelope.PlayerId);
        Assert.Equal(grant.GrantEventId, appended.Envelope.EventId);
    }

    [Fact]
    public async Task Challenge_RequiresAuth_AndNeverExposesOtherPlayersGrant()
    {
        var grant = CreateGrant("player-a", portalKey: PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out _, out _);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();

        var unauth = await client.GetAsync($"/api/personal-content/{grant.Id}/challenge");
        Assert.Equal(HttpStatusCode.Unauthorized, unauth.StatusCode);

        await AuthenticateAsync(client, "player-b", "User");
        var hidden = await client.GetAsync($"/api/personal-content/{grant.Id}/challenge");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        var attempt = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt",
            new { sequence = new[] { "sun", "moon", "star", "wave" } });
        Assert.Equal(HttpStatusCode.NotFound, attempt.StatusCode);
        Assert.False(grant.IsConsumed);
    }

    [Fact]
    public async Task Challenge_ValidatesAnswerAndConsumesExactlyOnce_WithoutSeedDisclosure()
    {
        var grant = CreateGrant("player-a", portalKey: PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out var events, out var uow);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");

        var preview = await client.GetAsync($"/api/personal-content/{grant.Id}/challenge");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        using var json = JsonDocument.Parse(await preview.Content.ReadAsStringAsync());
        Assert.False(json.RootElement.TryGetProperty("seed", out _));
        Assert.False(json.RootElement.TryGetProperty("rewardKey", out _));
        var answer = json.RootElement.GetProperty("sequence")
            .EnumerateArray().Select(x => x.GetString()!).ToArray();
        Assert.Equal(4, answer.Length);

        var bypass = await client.PostAsync($"/api/personal-content/{grant.Id}/consume", null);
        Assert.Equal(HttpStatusCode.Conflict, bypass.StatusCode);
        Assert.Equal("portal_challenge_required",
            (await bypass.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);

        var malformed = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt", new { sequence = new[] { "sun" } });
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        var wrong = answer.ToArray();
        wrong[0] = wrong[0] == "sun" ? "moon" : "sun";
        var incorrect = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt", new { sequence = wrong });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, incorrect.StatusCode);
        Assert.False(grant.IsConsumed);
        Assert.Empty(events.Appended);

        var correct = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt", new { sequence = answer });
        Assert.Equal(HttpStatusCode.OK, correct.StatusCode);
        Assert.True(grant.IsConsumed);
        Assert.Equal(1, repository.UpdateCalls);
        Assert.Equal(1, uow.SaveCalls);
        Assert.Single(events.Appended);

        var replay = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt", new { sequence = answer });
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        Assert.Single(events.Appended);
    }

    [Fact]
    public async Task Challenge_EnforcesServerSideRateLimitOnRepeatedInvalidAttempts()
    {
        var grant = CreateGrant("player-a", portalKey: PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out var events, out _);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");

        for (var attempt = 0; attempt < 12; attempt++)
        {
            var rejected = await client.PostAsJsonAsync(
                $"/api/personal-content/{grant.Id}/challenge/attempt",
                new { sequence = new[] { "invalid" } });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }

        var throttled = await client.PostAsJsonAsync(
            $"/api/personal-content/{grant.Id}/challenge/attempt",
            new { sequence = new[] { "invalid" } });
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.False(grant.IsConsumed);
        Assert.Empty(events.Appended);
    }

    [Fact]
    public async Task WorldPortals_RequireAuthenticationAndRevealOnlyJoinedOwnersMarkers()
    {
        var grantA = CreateGrant("player-a", PortalSequenceRules.PortalKey);
        var grantB = CreateGrant("player-b", PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out _, out _);
        repository.Grants.AddRange([grantA, grantB]);
        using var client = factory.CreateClient();

        var unauthorized = await client.GetAsync("/api/personal-content/world-portals");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
        await AuthenticateAsync(client, "player-a", "User");
        var beforeJoin = await client.GetFromJsonAsync<JsonElement>("/api/personal-content/world-portals");
        Assert.Empty(beforeJoin.EnumerateArray());

        var simulation = factory.Services.GetRequiredService<WorldSimulation>();
        simulation.Join("portal-connection-a", "player-a", CreateWorldCharacter("player-a"),
            new WorldSpawnPoint(0.5, 0.5));
        var response = await client.GetAsync("/api/personal-content/world-portals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var item = Assert.Single(json.RootElement.EnumerateArray().ToArray());
        Assert.Equal(grantA.Id, item.GetProperty("id").GetGuid());
        Assert.True(item.GetProperty("x").GetDouble() is >= -5.5 and <= 5.5);
        Assert.False(item.TryGetProperty("seed", out _));
        Assert.False(item.TryGetProperty("rewardKey", out _));
        Assert.False(item.TryGetProperty("playerId", out _));

        using var otherClient = factory.CreateClient();
        await AuthenticateAsync(otherClient, "player-b", "User");
        simulation.Join("portal-connection-b", "player-b", CreateWorldCharacter("player-b"),
            new WorldSpawnPoint(0.5, 0.5));
        var otherMarkers = await otherClient.GetFromJsonAsync<JsonElement>("/api/personal-content/world-portals");
        var onlyB = Assert.Single(otherMarkers.EnumerateArray().ToArray());
        Assert.Equal(grantB.Id, onlyB.GetProperty("id").GetGuid());
        var stolen = await otherClient.PostAsync(
            $"/api/personal-content/world-portals/{grantA.Id}/enter", null);
        Assert.Equal(HttpStatusCode.NotFound, stolen.StatusCode);
    }

    [Fact]
    public async Task WorldPortalEntry_RejectsNotJoinedAndClientSpoofedPosition_ButAllowsServerNearby()
    {
        var grant = CreateGrant("player-a", PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out var events, out var unitOfWork);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");

        var url = $"/api/personal-content/world-portals/{grant.Id}/enter";
        var notJoined = await client.PostAsync(url, null);
        Assert.Equal(HttpStatusCode.Conflict, notJoined.StatusCode);
        Assert.Equal("world_portal_not_joined",
            (await notJoined.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);

        var character = CreateWorldCharacter("player-a");
        var simulation = factory.Services.GetRequiredService<WorldSimulation>();
        simulation.Join("connection-far", "player-a", character, new WorldSpawnPoint(100.5, 100.5));
        var markers = await client.GetFromJsonAsync<JsonElement>("/api/personal-content/world-portals");
        var portal = Assert.Single(markers.EnumerateArray().ToArray());
        var x = portal.GetProperty("x").GetDouble();
        var y = portal.GetProperty("y").GetDouble();

        // The payload is deliberately ignored: the backend reads WorldSimulation.
        var spoof = await client.PostAsJsonAsync(url, new { x, y, playerId = "player-a" });
        Assert.Equal(HttpStatusCode.Conflict, spoof.StatusCode);
        Assert.Equal("world_portal_too_far",
            (await spoof.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
        Assert.False(grant.IsConsumed);
        Assert.Empty(events.Appended);
        Assert.Equal(0, unitOfWork.SaveCalls);

        Assert.NotNull(simulation.Leave("connection-far"));
        simulation.Join("connection-near", "player-a", character, new WorldSpawnPoint(x, y));
        var entered = await client.PostAsync(url, null);
        Assert.Equal(HttpStatusCode.OK, entered.StatusCode);
        Assert.False(grant.IsConsumed); // Entry only opens the minigame, never credits rewards.
        Assert.Empty(events.Appended);
    }

    [Fact]
    public async Task WorldPortalEntry_RejectsAlreadyConsumedGrant()
    {
        var grant = CreateGrant("player-a", PortalSequenceRules.PortalKey);
        Assert.True(grant.TryConsume(DateTimeOffset.UtcNow));
        using var factory = CreateFactory(out var repository, out _, out _);
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");
        factory.Services.GetRequiredService<WorldSimulation>().Join(
            "connection", "player-a", CreateWorldCharacter("player-a"), new WorldSpawnPoint(0.5, 0.5));

        var list = await client.GetFromJsonAsync<JsonElement>("/api/personal-content/world-portals");
        Assert.Empty(list.EnumerateArray());
        var replay = await client.PostAsync(
            $"/api/personal-content/world-portals/{grant.Id}/enter", null);
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        Assert.Equal("exclusive_content_consumed",
            (await replay.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    [Fact]
    public async Task WorldPortals_ChooseReachableTileNotDisconnectedWalkableIsland()
    {
        var grant = CreateGrant("player-a", PortalSequenceRules.PortalKey);
        using var factory = CreateFactory(out var repository, out _, out _, new IslandPortalMap());
        repository.Grants.Add(grant);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a", "User");
        factory.Services.GetRequiredService<WorldSimulation>().Join(
            "reachable-connection", "player-a", CreateWorldCharacter("player-a"),
            new WorldSpawnPoint(0.5, 0.5));

        var response = await client.GetFromJsonAsync<JsonElement>("/api/personal-content/world-portals");
        var marker = Assert.Single(response.EnumerateArray().ToArray());
        Assert.Equal(2.5d, marker.GetProperty("x").GetDouble());
        Assert.Equal(0.5d, marker.GetProperty("y").GetDouble());
    }

    private static PlayerCharacter CreateWorldCharacter(string ownerId) =>
        PlayerCharacter.Create(
            ownerId, "Portal Vuxian", PlayerAttributes.Create(0, 2, 0, 8, 0, 0),
            new CharacterAppearance(
                "hair-1", "black", "face-1", "body-1", "skin-1",
                "blue", "bottom-1", "black", "shoe-1", "black"));

    private static VuxoApiFactory CreateFactory(
        out FakeRepository repository,
        out FakeEventStore events,
        out FakeUnitOfWork unitOfWork,
        IWorldPortalMap? portalMap = null)
    {
        repository = new FakeRepository();
        events = new FakeEventStore();
        unitOfWork = new FakeUnitOfWork();
        var repositoryInstance = repository;
        var eventsInstance = events;
        var unitOfWorkInstance = unitOfWork;

        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IExclusiveContentGrantRepository>();
            services.RemoveAll<IGameEventStore>();
            services.RemoveAll<IUnitOfWork>();
            services.RemoveAll<IWorldPortalMap>();
            services.AddSingleton<IExclusiveContentGrantRepository>(repositoryInstance);
            services.AddSingleton<IGameEventStore>(eventsInstance);
            services.AddSingleton<IUnitOfWork>(unitOfWorkInstance);
            services.AddSingleton<IWorldPortalMap>(portalMap ?? new FakePortalMap());
        });
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

    private static object ValidGrantRequest(string playerId) => new
    {
        sourceEventId = Guid.NewGuid(),
        playerId,
        contentKey = "portal.grove.001",
        portalKey = "portal-key",
        dialogBranchKey = "dialog-key",
        rewardKey = "reward-key",
        seed = 123456L,
        ruleVersion = "personal-content-v1",
        correlationId = Guid.NewGuid(),
        causationId = (Guid?)null,
        expiresAtUtc = DateTimeOffset.UtcNow.AddHours(1)
    };

    private static ExclusiveContentGrant CreateGrant(string playerId, string portalKey = "portal-key") =>
        ExclusiveContentGrant.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            playerId,
            "content-key",
            portalKey,
            "dialog-key",
            "reward-key",
            42,
            "rules-v1",
            Guid.NewGuid(),
            Guid.NewGuid(),
            DateTimeOffset.UtcNow.AddMinutes(-5),
            DateTimeOffset.UtcNow.AddHours(1));

    private sealed class FakeRepository : IExclusiveContentGrantRepository
    {
        public List<ExclusiveContentGrant> Grants { get; } = [];
        public int UpdateCalls { get; private set; }

        public Task AddAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
        {
            Grants.Add(grant);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
        {
            UpdateCalls++;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableForPlayerAsync(
            string playerId,
            DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            IReadOnlyList<ExclusiveContentGrant> grants = Grants
                .Where(x => x.PlayerId == playerId && x.IsAvailable(now))
                .ToArray();
            return Task.FromResult(grants);
        }

        public Task<ExclusiveContentGrant?> GetByIdForPlayerAsync(
            Guid grantId,
            string playerId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(Grants.SingleOrDefault(x => x.Id == grantId && x.PlayerId == playerId));
    }

    private sealed class FakeEventStore : IGameEventStore
    {
        public List<(GameEventEnvelope Envelope, string PayloadJson)> Appended { get; } = [];

        public Task AppendAsync(
            GameEventEnvelope envelope,
            string payloadJson,
            CancellationToken cancellationToken = default)
        {
            Appended.Add((envelope, payloadJson));
            return Task.CompletedTask;
        }
    }

    private sealed class IslandPortalMap : IWorldPortalMap
    {
        public Task<WorldSpawnPoint> GetSpawnPointAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new WorldSpawnPoint(0.5, 0.5));

        public ValueTask<bool> IsWalkableAsync(
            double worldX, double worldY, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(
                (worldX == 1.5 && worldY == 0.5)
                || (worldX == 2.5 && worldY == 0.5)
                || (worldX == 0.5 && worldY == 3.5));
    }

    private sealed class FakePortalMap : IWorldPortalMap
    {
        public Task<WorldSpawnPoint> GetSpawnPointAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(new WorldSpawnPoint(0.5, 0.5));

        public ValueTask<bool> IsWalkableAsync(
            double worldX, double worldY, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(
                double.IsFinite(worldX) && double.IsFinite(worldY)
                && Math.Abs(worldX) <= 8 && Math.Abs(worldY) <= 8);
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
    private sealed record ErrorResponse(string Code);
}
