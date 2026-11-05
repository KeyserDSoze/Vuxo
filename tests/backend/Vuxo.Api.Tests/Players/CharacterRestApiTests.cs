using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class CharacterRestApiTests
{
    [Fact]
    public async Task Rest_RequiresAuthentication()
    {
        using var factory = CreateFactory(new FakeRestRepository());
        using var client = factory.CreateClient();
        using var request = NewRequest(Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(request)).StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-guid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task Rest_RequiresWellFormedIdempotencyKey(string? key)
    {
        using var factory = CreateFactory(new FakeRestRepository());
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/characters/me/rest");
        if (key is not null) request.Headers.Add("Idempotency-Key", key);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(CharacterRestErrorCodes.InvalidIdempotencyKey,
            (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    [Fact]
    public async Task Rest_UsesJwtOwnerAndPreservesClientIdempotencyKey()
    {
        var fake = new FakeRestRepository();
        using var factory = CreateFactory(fake);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        var key = Guid.NewGuid();
        using var request = NewRequest(key);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("player-a", fake.OwnerId);
        Assert.Equal(key, fake.Key);
        var result = await response.Content.ReadFromJsonAsync<CharacterRestResult>();
        Assert.NotNull(result);
        Assert.Equal(5, result.RestoredHealth);
        Assert.Equal(12, result.CurrentHealth);
    }

    [Theory]
    [InlineData(CharacterRestErrorCodes.CharacterNotFound, HttpStatusCode.NotFound)]
    [InlineData(CharacterRestErrorCodes.AlreadyFull, HttpStatusCode.Conflict)]
    [InlineData(CharacterRestErrorCodes.Unavailable, HttpStatusCode.Conflict)]
    [InlineData(CharacterRestErrorCodes.Cooldown, HttpStatusCode.Conflict)]
    public async Task Rest_MapsDomainErrorsToStableHttpCodes(string code, HttpStatusCode expected)
    {
        using var factory = CreateFactory(new FakeRestRepository { ErrorCode = code });
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        using var request = NewRequest(Guid.NewGuid());
        using var response = await client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code);
    }

    private static HttpRequestMessage NewRequest(Guid key)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "/api/characters/me/rest");
        message.Headers.Add("Idempotency-Key", key.ToString());
        return message;
    }

    private static VuxoApiFactory CreateFactory(FakeRestRepository fake) =>
        new(configureServices: services =>
        {
            services.RemoveAll<ICharacterRestRepository>();
            services.AddSingleton<ICharacterRestRepository>(fake);
        });

    private static async Task AuthenticateAsync(HttpClient client, string ownerId)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = ownerId, displayName = "Rest Tester", role = "User"
        });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    private sealed record LoginResponse(string AccessToken, string TokenType);
    private sealed record ErrorResponse(string Code);

    private sealed class FakeRestRepository : ICharacterRestRepository
    {
        public string? OwnerId { get; private set; }
        public Guid? Key { get; private set; }
        public string? ErrorCode { get; init; }

        public Task<CharacterRestResult> RestAsync(string ownerId, Guid idempotencyKey,
            DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            OwnerId = ownerId;
            Key = idempotencyKey;
            if (ErrorCode is not null)
                throw new CharacterRestException(ErrorCode,
                    ErrorCode == CharacterRestErrorCodes.Cooldown ? now.AddMinutes(1) : null);
            return Task.FromResult(new CharacterRestResult(
                idempotencyKey, 7, 12, 20, 5,
                now, now.Add(CharacterRestRules.Cooldown), Replayed: false));
        }
    }
}
