using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class CharacterHealingApiTests
{
    [Fact]
    public async Task Heal_RequiresAuth()
    {
        using var factory = Factory(new FakeHealing());
        using var client = factory.CreateClient();
        using var response = await client.PostAsync(
            $"/api/characters/me/heal/{Guid.NewGuid()}", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task Heal_RequiresValidIdempotencyKey(string? key)
    {
        using var factory = Factory(new FakeHealing());
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"/api/characters/me/heal/{Guid.NewGuid()}");
        if (key is not null) req.Headers.Add("Idempotency-Key", key);
        using var response = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CharacterHealingErrorCodes.InvalidKey,
            (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    [Fact]
    public async Task Heal_UsesAuthenticatedOwner_AndNeverClientHp()
    {
        var store = new FakeHealing();
        using var factory = Factory(store);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        var grant = Guid.NewGuid();
        var key = Guid.NewGuid();
        using var request = NewRequest(grant, key);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("player-a", store.PlayerId);
        Assert.Equal(grant, store.GrantId);
        Assert.Equal(key, store.Key);
        var result = await response.Content.ReadFromJsonAsync<CharacterHealingResult>();
        Assert.NotNull(result);
        Assert.Equal(10, result.RestoredHealth);
        Assert.Equal(15, result.CurrentHealth);
    }

    [Theory]
    [InlineData(CharacterHealingErrorCodes.CharacterNotFound, HttpStatusCode.NotFound)]
    [InlineData(CharacterHealingErrorCodes.ItemNotOwned, HttpStatusCode.NotFound)]
    [InlineData(CharacterHealingErrorCodes.NotConsumable, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.ItemEquipped, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.ItemUsed, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.KeyReused, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.AlreadyFull, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.Unavailable, HttpStatusCode.Conflict)]
    [InlineData(CharacterHealingErrorCodes.EncounterActive, HttpStatusCode.Conflict)]
    public async Task Heal_MapsDomainErrors(string code, HttpStatusCode expected)
    {
        using var factory = Factory(new FakeHealing { ErrorCode = code });
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");
        using var request = NewRequest(Guid.NewGuid(), Guid.NewGuid());
        using var response = await client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    private static VuxoApiFactory Factory(FakeHealing store) =>
        new(configureServices: services =>
        {
            services.RemoveAll<ICharacterHealingRepository>();
            services.AddSingleton<ICharacterHealingRepository>(store);
        });

    private static HttpRequestMessage NewRequest(Guid grant, Guid key)
    {
        var req = new HttpRequestMessage(HttpMethod.Post,
            $"/api/characters/me/heal/{grant}");
        req.Headers.Add("Idempotency-Key", key.ToString());
        return req;
    }

    private static async Task LoginAsync(HttpClient client, string subject)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/mock",
            new { subject, displayName = subject, role = "User" });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<MockLogin>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    private sealed record MockLogin(string AccessToken);
    private sealed record ErrorResponse(string Code);

    private sealed class FakeHealing : ICharacterHealingRepository
    {
        public string? PlayerId { get; private set; }
        public Guid? GrantId { get; private set; }
        public Guid? Key { get; private set; }
        public string? ErrorCode { get; init; }

        public Task<CharacterHealingResult> HealAsync(string playerId, Guid grantId,
            Guid idempotencyKey, DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            PlayerId = playerId;
            GrantId = grantId;
            Key = idempotencyKey;
            if (ErrorCode is not null) throw new CharacterHealingException(ErrorCode);
            return Task.FromResult(new CharacterHealingResult(
                grantId, idempotencyKey, 5, 15, 20, 10, now, Replayed: false));
        }
    }
}
