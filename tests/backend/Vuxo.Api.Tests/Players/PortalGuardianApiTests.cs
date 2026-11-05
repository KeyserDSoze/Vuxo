using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class PortalGuardianApiTests
{
    private static readonly Guid GrantId = Guid.Parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    [Fact]
    public async Task GuardianStatusAndAction_RequireJwt()
    {
        using var factory = Factory(new Stub());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync(StatusUrl())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync(HistoryUrl())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(TurnUrl(), new { action = "strike", expectedTurn = 0 }))
                .StatusCode);
    }

    [Fact]
    public async Task GuardianStatus_OnlyReturnsTheLoggedInOwnersActiveEncounter()
    {
        var fake = new Stub();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var result = await client.GetFromJsonAsync<PortalGuardianStatus>(StatusUrl());
        Assert.NotNull(result);
        Assert.Equal(GrantId, result.GrantId);
        Assert.Equal(6, result.GuardianHealth);
        Assert.Equal(PortalGuardianRules.Version, result.RuleVersion);
        Assert.Equal("player-a", fake.OwnerId);

        using var foreign = factory.CreateClient();
        await LoginAsync(foreign, "player-b");
        var unavailable = await foreign.GetAsync(StatusUrl());
        Assert.Equal(HttpStatusCode.NotFound, unavailable.StatusCode);
        Assert.Equal(PortalGuardianErrorCodes.Unavailable,
            (await unavailable.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }


    [Fact]
    public async Task GuardianHistory_RequiresOwnerAndExposesOnlySafeOrderedTurnFields()
    {
        using var factory = Factory(new Stub());
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var response = await client.GetAsync(HistoryUrl());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = System.Text.Json.JsonDocument.Parse(
            await response.Content.ReadAsStringAsync());
        var entry = Assert.Single(json.RootElement.EnumerateArray());
        Assert.Equal(1, entry.GetProperty("turn").GetInt32());
        Assert.Equal("strike", entry.GetProperty("action").GetString());
        Assert.Equal(5, entry.GetProperty("guardianHealth").GetInt32());
        Assert.True(entry.TryGetProperty("occurredAtUtc", out _));
        Assert.False(entry.TryGetProperty("idempotencyKey", out _));
        Assert.False(entry.TryGetProperty("seed", out _));
        Assert.False(entry.TryGetProperty("encounterEventId", out _));
        Assert.False(entry.TryGetProperty("playerId", out _));

        using var foreign = factory.CreateClient();
        await LoginAsync(foreign, "player-b");
        var unavailable = await foreign.GetAsync(HistoryUrl());
        Assert.Equal(HttpStatusCode.NotFound, unavailable.StatusCode);
        Assert.Equal(PortalGuardianErrorCodes.Unavailable,
            (await unavailable.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }


    [Fact]
    public async Task V2FeintIntent_RequiresJwtAndPassesOnlyCardToAuthority()
    {
        var fake = new Stub();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var response = await PostAsync(client, PortalGuardianRules.Feint, 0, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(PortalGuardianRules.Feint, fake.Action);
        Assert.Equal(0, fake.ExpectedTurn);
        Assert.Equal("player-a", fake.OwnerId);
        Assert.Equal(1, fake.Calls);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("bad-key")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task GuardianTurn_NeedsIdempotencyKey(string? key)
    {
        using var factory = Factory(new Stub());
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        using var request = new HttpRequestMessage(HttpMethod.Post, TurnUrl())
        {
            Content = JsonContent.Create(new { action = "strike", expectedTurn = 0 })
        };
        if (key is not null) request.Headers.Add("Idempotency-Key", key);
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(PortalGuardianErrorCodes.KeyRequired,
            (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    [Theory]
    [InlineData("heal", 0, PortalGuardianErrorCodes.InvalidAction)]
    [InlineData("", 0, PortalGuardianErrorCodes.InvalidAction)]
    [InlineData("strike", -1, PortalGuardianErrorCodes.InvalidTurn)]
    [InlineData("strike", 12, PortalGuardianErrorCodes.InvalidTurn)]
    public async Task GuardianTurn_RejectsUnknownClientCardsAndInvalidTurns(
        string action, int expectedTurn, string code)
    {
        var fake = new Stub();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var response = await PostAsync(client, action, expectedTurn, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
        Assert.Equal(0, fake.Calls);
    }

    [Fact]
    public async Task GuardianTurn_AcceptsOnlyIntentAndReturnsServerCalculatedCombat()
    {
        var fake = new Stub();
        using var factory = Factory(fake);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var key = Guid.NewGuid();
        using var request = new HttpRequestMessage(HttpMethod.Post, TurnUrl())
        {
            Content = JsonContent.Create(new
            {
                action = "strike", expectedTurn = 0,
                playerHealth = 999, guardianHealth = 0,
                damage = 99999, enemyAction = "retreat",
                playerId = "other-player", seed = long.MaxValue
            })
        };
        request.Headers.Add("Idempotency-Key", key.ToString());
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("player-a", fake.OwnerId);
        Assert.Equal(GrantId, fake.Grant);
        Assert.Equal(key, fake.Key);
        Assert.Equal("strike", fake.Action);
        Assert.Equal(0, fake.ExpectedTurn);
        var result = await response.Content.ReadFromJsonAsync<PortalGuardianTurnResult>();
        Assert.NotNull(result);
        Assert.Equal(1, result.DamageDealt);
        Assert.Equal(5, result.GuardianHealth);
        Assert.Equal(20, result.PlayerHealth);
        Assert.False(result.Replayed);
    }

    [Theory]
    [InlineData(PortalGuardianErrorCodes.Unavailable, HttpStatusCode.NotFound)]
    [InlineData(PortalGuardianErrorCodes.StaleTurn, HttpStatusCode.Conflict)]
    [InlineData(PortalGuardianErrorCodes.Finished, HttpStatusCode.Conflict)]
    [InlineData(PortalGuardianErrorCodes.KeyReused, HttpStatusCode.Conflict)]
    [InlineData(PortalGuardianErrorCodes.TooInjured, HttpStatusCode.Conflict)]
    public async Task GuardianTurn_MapsStableDomainErrorCodes(string code, HttpStatusCode expected)
    {
        using var factory = Factory(new Stub { ErrorCode = code });
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var response = await PostAsync(client, "guard", 0, Guid.NewGuid());
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    private static string StatusUrl() =>
        $"/api/characters/me/portal-guardian/{GrantId}";

    private static string HistoryUrl() => StatusUrl() + "/history";

    private static string TurnUrl() => StatusUrl() + "/turn";

    private static Task<HttpResponseMessage> PostAsync(HttpClient client,
        string action, int turn, Guid key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, TurnUrl())
        {
            Content = JsonContent.Create(new { action, expectedTurn = turn })
        };
        request.Headers.Add("Idempotency-Key", key.ToString());
        return client.SendAsync(request);
    }

    private static VuxoApiFactory Factory(Stub fake) => new(
        configureServices: services =>
        {
            services.RemoveAll<IPortalGuardianRepository>();
            services.AddSingleton<IPortalGuardianRepository>(fake);
        });

    private static async Task LoginAsync(HttpClient client, string ownerId)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = ownerId, displayName = "Guardian API Tester", role = "User"
        });
        response.EnsureSuccessStatusCode();
        var login = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(login);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", login.AccessToken);
    }

    private sealed record LoginResponse(string AccessToken);
    private sealed record ErrorResponse(string Code);

    private sealed class Stub : IPortalGuardianRepository
    {
        public string? OwnerId { get; private set; }
        public Guid? Grant { get; private set; }
        public Guid? Key { get; private set; }
        public string? Action { get; private set; }
        public int? ExpectedTurn { get; private set; }
        public int Calls { get; private set; }
        public string? ErrorCode { get; init; }

        public Task<PortalGuardianStatus?> GetAsync(
            string playerId, Guid grantId, DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            OwnerId = playerId;
            return Task.FromResult<PortalGuardianStatus?>(
                playerId == "player-a" && grantId == GrantId
                    ? new(grantId, 0, 6, 6, 20, 20,
                        PortalGuardianRules.Ongoing, PortalGuardianRules.Version)
                    : null);
        }

        public Task<IReadOnlyList<PortalGuardianHistoryEntry>?> GetHistoryAsync(
            string playerId, Guid grantId, DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            OwnerId = playerId;
            IReadOnlyList<PortalGuardianHistoryEntry>? history =
                playerId == "player-a" && grantId == GrantId
                    ? [new PortalGuardianHistoryEntry(1, "strike", "guard",
                        1, 0, 5, 20, "ongoing", now)]
                    : null;
            return Task.FromResult(history);
        }

        public Task<PortalGuardianTurnResult> PlayAsync(
            string playerId, Guid grantId, string action, int expectedTurn,
            Guid idempotencyKey, DateTimeOffset now,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            OwnerId = playerId;
            Grant = grantId;
            Action = action;
            ExpectedTurn = expectedTurn;
            Key = idempotencyKey;
            if (ErrorCode is not null) throw new PortalGuardianException(ErrorCode);
            return Task.FromResult(new PortalGuardianTurnResult(
                grantId, idempotencyKey, 1, action, "guard",
                1, 0, 5, 6, 20, 20, "ongoing", Replayed: false));
        }
    }
}
