using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class CharacterHealthApiTests
{
    [Fact]
    public async Task ReadingHealth_RequiresAuthentication()
    {
        using var factory = CreateFactory(null);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/characters/me/health")).StatusCode);
    }

    [Fact]
    public async Task ReadingHealth_ReturnsPersistedValueForAuthenticatedOwner()
    {
        var attributes = PlayerAttributes.Create(2, 2, 2, 2, 1, 1);
        var character = PlayerCharacter.Rehydrate(Guid.NewGuid(), "player-a", "Vuxian", 0, attributes, Appearance(), 7);
        using var factory = CreateFactory(character);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var response = await client.GetAsync("/api/characters/me/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var health = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(health);
        Assert.Equal("Vuxian", health.Name);
        Assert.Equal(7, health.CurrentHealth);
        Assert.Equal(20, health.MaxHealth);
        Assert.Equal(PlayerHealth.RulesVersion, health.RulesVersion);
    }

    [Fact]
    public async Task ReadingHealth_CannotReadAnotherPlayersHealth()
    {
        var character = PlayerCharacter.Create("owner-secret", "Secret Hero",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1), Appearance());
        using var factory = CreateFactory(character);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");
        var response = await client.GetAsync("/api/characters/me/health");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("character_not_found", error?.Code);
    }

    [Fact]
    public async Task HealthReadEndpoint_DoesNotAcceptClientWrites()
    {
        using var factory = CreateFactory(null);
        using var client = factory.CreateClient();
        await SignInAsync(client, "player-a");

        var response = await client.PatchAsJsonAsync("/api/characters/me/health",
            new { currentHealth = 999 });
        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
    }

    private static VuxoApiFactory CreateFactory(PlayerCharacter? existing)
    {
        var repository = new FakeCharacters(existing);
        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IPlayerCharacterRepository>();
            services.AddSingleton<IPlayerCharacterRepository>(repository);
        });
    }

    private static async Task SignInAsync(HttpClient client, string subject)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject, displayName = "Health Tester", role = "User"
        });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    private static CharacterAppearance Appearance() => new(
        "hair-1", "black", "face-1", "body-1", "skin-1", "blue",
        "shorts", "black", "shoe-1", "white");

    private sealed record HealthResponse(string Name, int CurrentHealth, int MaxHealth, string RulesVersion);
    private sealed record ErrorResponse(string Code);
    private sealed record LoginResponse(string AccessToken, string TokenType);

    private sealed class FakeCharacters(PlayerCharacter? existing) : IPlayerCharacterRepository
    {
        public Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default)
            => Task.FromResult(existing?.OwnerId == ownerId ? existing : null);

        public Task AddAsync(PlayerCharacter character, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }
}
