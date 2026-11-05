using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class PortalEncounterStatusApiTests
{
    [Fact]
    public async Task Status_RequiresAuthentication()
    {
        using var factory = Factory(new Stub());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/characters/me/encounter")).StatusCode);
    }

    [Fact]
    public async Task Status_ReadsOnlyAuthenticatedOwner_AndDoesNotExposeOtherPlayers()
    {
        var encounter = new Stub();
        using var factory = Factory(encounter);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        var result = await client.GetFromJsonAsync<PortalEncounterStatus>(
            "/api/characters/me/encounter");
        Assert.NotNull(result);
        Assert.True(result.Active);
        Assert.Equal("player-a", encounter.PlayerId);
        Assert.Equal(encounter.GrantId, result.PortalGrantId);
        using var otherClient = factory.CreateClient();
        await AuthenticateAsync(otherClient, "player-b");
        var other = await otherClient.GetFromJsonAsync<PortalEncounterStatus>(
            "/api/characters/me/encounter");
        Assert.NotNull(other);
        Assert.False(other.Active);
        Assert.Null(other.PortalGrantId);
    }

    [Fact]
    public async Task NoPublicEncounterStartOrFinishRouteExists()
    {
        using var factory = Factory(new Stub());
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsync("/api/characters/me/encounter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.DeleteAsync("/api/characters/me/encounter")).StatusCode);
    }

    private static VuxoApiFactory Factory(Stub stub) =>
        new(configureServices: services =>
        {
            services.RemoveAll<IPortalEncounterRepository>();
            services.AddSingleton<IPortalEncounterRepository>(stub);
        });

    private static async Task AuthenticateAsync(HttpClient client, string ownerId)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = ownerId, displayName = "Encounter Tester", role = "User"
        });
        response.EnsureSuccessStatusCode();
        var session = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);
    }

    private sealed record LoginResponse(string AccessToken);

    private sealed class Stub : IPortalEncounterRepository
    {
        public string? PlayerId { get; private set; }
        public Guid GrantId { get; } = Guid.NewGuid();

        public Task<PortalEncounterStatus> GetStatusAsync(string playerId,
            DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            PlayerId = playerId;
            return Task.FromResult(string.Equals(playerId, "player-a", StringComparison.Ordinal)
                ? new PortalEncounterStatus(true, GrantId, now.AddMinutes(3))
                : new PortalEncounterStatus(false, null, null));
        }

        public Task<PortalEncounterStatus> StartVerifiedPortalAsync(
            string playerId, Guid portalGrantId, DateTimeOffset now,
            CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("Untrusted client may never start encounters.");
    }
}
