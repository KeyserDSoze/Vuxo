using System.Collections.Concurrent;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Common;
using Vuxo.Domain.Players;
using Vuxo.Domain.Worlds;

namespace Vuxo.Api.Tests.Realtime;

public sealed class WorldHubTests
{
    [Fact]
    public async Task WorldHub_TwoClientsObserveJoinMoveAndLeave()
    {
        using var factory = CreateFactory();
        using var httpClient = factory.CreateClient();
        var tokenA = await AuthenticateAsync(httpClient, "player-a");
        var tokenB = await AuthenticateAsync(httpClient, "player-b");

        await using var connectionA = CreateConnection(factory, tokenA);
        await using var connectionB = CreateConnection(factory, tokenB);

        var playerJoined = new TaskCompletionSource<WorldPlayerSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
        var playerMoved = new TaskCompletionSource<WorldPlayerSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
        var playerLeft = new TaskCompletionSource<WorldPlayerSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);

        connectionA.On<WorldPlayerSnapshot>("world.playerJoined", player =>
        {
            if (player.PlayerId == "player-b")
            {
                playerJoined.TrySetResult(player);
            }
        });
        connectionA.On<WorldSimulationDelta>("world.delta", delta =>
        {
            var moved = delta.Players.FirstOrDefault(player => player.PlayerId == "player-b");
            if (moved is not null)
            {
                playerMoved.TrySetResult(moved);
            }
        });
        connectionA.On<WorldPlayerSnapshot>("world.playerLeft", player =>
        {
            if (player.PlayerId == "player-b")
            {
                playerLeft.TrySetResult(player);
            }
        });

        await connectionA.StartAsync();
        await connectionB.StartAsync();
        await connectionA.InvokeAsync("JoinWorld");
        await connectionB.InvokeAsync("JoinWorld");

        var joined = await playerJoined.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("player-b", joined.PlayerId);
        Assert.Equal(CharacterAppearanceCatalog.Version, joined.Appearance?.CatalogVersion);
        Assert.Equal("red", joined.Appearance?.HairColor);
        Assert.Equal("skirt", joined.Appearance?.BottomStyle);


        await connectionB.InvokeAsync("SetMovementIntent", 1, 0, 1L);
        var moved = await playerMoved.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(moved.X > joined.X);
        Assert.Equal(joined.Y, moved.Y, 10);

        await connectionB.InvokeAsync("LeaveWorld");
        var left = await playerLeft.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("player-b", left.PlayerId);
    }

    [Fact]
    public async Task UpdatingSavedAppearance_BroadcastsToPeersOnlyAfterOwnerScopedCommit()
    {
        using var factory = CreateFactory();
        using var http = factory.CreateClient();
        var tokenA = await AuthenticateAsync(http, "player-a");
        var tokenB = await AuthenticateAsync(http, "player-b");

        await using var connectionA = CreateConnection(factory, tokenA);
        await using var connectionB = CreateConnection(factory, tokenB);
        var changed = new TaskCompletionSource<WorldPlayerSnapshot>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        connectionB.On<WorldPlayerSnapshot>("world.playerUpdated", snapshot =>
        {
            if (snapshot.PlayerId == "player-a" && snapshot.AppearanceRevision == 1)
                changed.TrySetResult(snapshot);
        });

        await connectionA.StartAsync();
        await connectionB.StartAsync();
        await connectionA.InvokeAsync("JoinWorld");
        await connectionB.InvokeAsync("JoinWorld");

        http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", tokenA);
        var savedLook = await http.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/characters/me/appearance");
        Assert.Equal(0, savedLook.GetProperty("appearanceRevision").GetInt64());

        var requested = new
        {
            catalogVersion = "0.0.1",
            expectedRevision = 0,
            appearance = new
            {
                hairStyle = "hair-4", hairColor = "blue", face = "face-2",
                bodyType = "body-1", skinTone = "skin-5", topColor = "green",
                bottomStyle = "skirt", bottomColor = "white",
                shoeStyle = "shoe-3", shoeColor = "red"
            }
        };
        var response = await http.PatchAsJsonAsync("/api/characters/me/appearance", requested);
        response.EnsureSuccessStatusCode();
        var updated = await changed.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("blue", updated.Appearance?.HairColor);
        Assert.Equal(1, updated.AppearanceRevision);

        // The old request is safe to replay and must not increment revision.
        var duplicate = await http.PatchAsJsonAsync("/api/characters/me/appearance", requested);
        duplicate.EnsureSuccessStatusCode();
        var duplicatePayload = await duplicate.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.False(duplicatePayload.GetProperty("changed").GetBoolean());
        Assert.Equal(1, duplicatePayload.GetProperty("appearanceRevision").GetInt64());

        var conflict = await http.PatchAsJsonAsync("/api/characters/me/appearance", new
        {
            catalogVersion = "0.0.1", expectedRevision = 0,
            appearance = new { requested.appearance.hairStyle, hairColor = "red",
                requested.appearance.face, requested.appearance.bodyType,
                requested.appearance.skinTone, requested.appearance.topColor,
                requested.appearance.bottomStyle, requested.appearance.bottomColor,
                requested.appearance.shoeStyle, requested.appearance.shoeColor }
        });
        Assert.Equal(System.Net.HttpStatusCode.Conflict, conflict.StatusCode);

        http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", tokenB);
        var peerLook = await http.GetFromJsonAsync<System.Text.Json.JsonElement>(
            "/api/characters/me/appearance");
        Assert.Equal("red", peerLook.GetProperty("appearance").GetProperty("hairColor").GetString());
        Assert.Equal(0, peerLook.GetProperty("appearanceRevision").GetInt64());

        await connectionA.InvokeAsync("LeaveWorld");
        await connectionA.InvokeAsync("JoinWorld");
        var state = await connectionA.InvokeAsync<WorldJoinResult>("JoinWorld");
        Assert.Equal("blue", state.Self.Appearance?.HairColor);
        Assert.Equal(1, state.Self.AppearanceRevision);
    }

    private static VuxoApiFactory CreateFactory()
    {
        var players = new FakePlayerRepository(
            CreateCharacter("player-a", "Alpha", 2),
            CreateCharacter("player-b", "Bravo", 5, new CharacterAppearance(
                "hair-4", "red", "face-3", "body-2", "skin-4",
                "green", "skirt", "blue", "shoe-2", "white")));
        var worlds = new FakeWorldRepository();
        var unitOfWork = new FakeUnitOfWork();

        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IPlayerCharacterRepository>();
            services.RemoveAll<ICharacterAppearanceRepository>();
            services.RemoveAll<IWorldRepository>();
            services.RemoveAll<IUnitOfWork>();
            services.AddSingleton<IPlayerCharacterRepository>(players);
            services.AddSingleton<ICharacterAppearanceRepository>(players);
            services.AddSingleton<IWorldRepository>(worlds);
            services.AddSingleton<IUnitOfWork>(unitOfWork);
        });
    }

    private static HubConnection CreateConnection(VuxoApiFactory factory, string token)
        => new HubConnectionBuilder()
            .WithUrl("http://localhost/hubs/world", options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            })
            .Build();

    private static async Task<string> AuthenticateAsync(HttpClient client, string subject)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = subject,
            role = "User"
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        return payload.AccessToken;
    }

    private static PlayerCharacter CreateCharacter(string ownerId, string name, int dexterity, CharacterAppearance? appearance = null)
        => PlayerCharacter.Create(
            ownerId,
            name,
            PlayerAttributes.Create(0, dexterity, 0, 10 - dexterity, 0, 0),
            appearance ?? new CharacterAppearance(
                "hair-1",
                "black",
                "face-1",
                "body-1",
                "skin-1",
                "blue",
                "shorts",
                "black",
                "shoe-1",
                "black"));

    private sealed record MockLoginResponse(string AccessToken, string TokenType);

    private sealed class FakePlayerRepository(params PlayerCharacter[] characters) : IPlayerCharacterRepository, ICharacterAppearanceRepository
    {
        private readonly Dictionary<string, PlayerCharacter> _characters = characters.ToDictionary(
            character => character.OwnerId,
            StringComparer.Ordinal);

        public Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default)
        {
            lock (_characters)
                return Task.FromResult(_characters.GetValueOrDefault(ownerId));
        }

        public Task<bool> TryUpdateAsync(string ownerId, long expectedRevision,
            CharacterAppearance appearance, CancellationToken cancellationToken = default)
        {
            lock (_characters)
            {
                if (!_characters.TryGetValue(ownerId, out var current)
                    || current.AppearanceRevision != expectedRevision)
                    return Task.FromResult(false);
                _characters[ownerId] = PlayerCharacter.Rehydrate(
                    current.Id, current.OwnerId, current.Name, current.Level,
                    current.Attributes, appearance, current.CurrentHealth, expectedRevision + 1);
                return Task.FromResult(true);
            }
        }

        public Task AddAsync(PlayerCharacter character, CancellationToken cancellationToken = default)
            => throw new NotSupportedException();
    }

    private sealed class FakeWorldRepository : IWorldRepository
    {
        private readonly object _gate = new();
        private readonly ConcurrentDictionary<(string WorldId, int X, int Y), WorldChunkMetadata> _chunks = new();
        private WorldDefinition? _definition;

        public Task<WorldDefinition?> GetDefinitionAsync(string worldId, CancellationToken cancellationToken = default)
        {
            lock (_gate)
            {
                return Task.FromResult(_definition?.WorldId == worldId ? _definition : null);
            }
        }

        public Task<WorldChunkMetadata?> GetChunkAsync(
            string worldId,
            ChunkCoordinate coordinate,
            CancellationToken cancellationToken = default)
            => Task.FromResult(
                _chunks.TryGetValue((worldId, coordinate.X, coordinate.Y), out var chunk)
                    ? chunk
                    : null);

        public Task AddDefinitionAsync(WorldDefinition definition, CancellationToken cancellationToken = default)
        {
            lock (_gate)
            {
                _definition ??= definition;
            }

            return Task.CompletedTask;
        }

        public Task AddChunkAsync(WorldChunkMetadata chunk, CancellationToken cancellationToken = default)
        {
            _chunks[(chunk.WorldId, chunk.Coordinate.X, chunk.Coordinate.Y)] = chunk;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
            => Task.FromResult(1);
    }
}
