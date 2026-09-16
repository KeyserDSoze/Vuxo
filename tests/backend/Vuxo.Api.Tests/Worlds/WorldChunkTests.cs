using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Common;
using Vuxo.Domain.Worlds;

namespace Vuxo.Api.Tests.Worlds;

public sealed class WorldChunkTests
{
    [Fact]
    public async Task GetChunk_RequiresAuthentication()
    {
        using var factory = CreateFactory(out _, out _);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/world/chunks/0/0");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetChunk_ReturnsDeterministicTilesWithoutExposingSeed()
    {
        using var factory = CreateFactory(out _, out _);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client);

        var response = await client.GetAsync("/api/world/chunks/0/0");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal("vuxo-test-world", root.GetProperty("worldId").GetString());
        Assert.Equal(1, root.GetProperty("generatorVersion").GetInt32());
        Assert.False(root.TryGetProperty("seed", out _));

        var chunk = root.GetProperty("chunk");
        Assert.Equal(0, chunk.GetProperty("x").GetInt32());
        Assert.Equal(0, chunk.GetProperty("y").GetInt32());
        Assert.Equal(16, chunk.GetProperty("size").GetInt32());
        Assert.Equal(
            "f5b1856453d59fa2cfe894bc2a52101c4503dc09cb2b36c3e0a4619a644c69f6",
            chunk.GetProperty("fingerprint").GetString());
        Assert.Equal(256, chunk.GetProperty("tiles").GetArrayLength());

        var firstTile = chunk.GetProperty("tiles")[0];
        Assert.True(firstTile.TryGetProperty("kind", out _));
        Assert.True(firstTile.TryGetProperty("isWalkable", out _));
        Assert.True(firstTile.TryGetProperty("worldX", out _));
        Assert.True(firstTile.TryGetProperty("worldY", out _));
    }

    [Fact]
    public async Task GetChunk_RepeatedAccess_MaterializesMetadataOnlyOnce()
    {
        using var factory = CreateFactory(out _, out var unitOfWork);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client);

        var firstResponse = await client.GetAsync("/api/world/chunks/-2/3");
        var secondResponse = await client.GetAsync("/api/world/chunks/-2/3");

        firstResponse.EnsureSuccessStatusCode();
        secondResponse.EnsureSuccessStatusCode();
        using var first = JsonDocument.Parse(await firstResponse.Content.ReadAsStringAsync());
        using var second = JsonDocument.Parse(await secondResponse.Content.ReadAsStringAsync());
        var firstChunk = first.RootElement.GetProperty("chunk");
        var secondChunk = second.RootElement.GetProperty("chunk");

        Assert.True(firstChunk.GetProperty("newlyMaterialized").GetBoolean());
        Assert.False(secondChunk.GetProperty("newlyMaterialized").GetBoolean());
        Assert.Equal(
            firstChunk.GetProperty("fingerprint").GetString(),
            secondChunk.GetProperty("fingerprint").GetString());
        Assert.Equal(1, unitOfWork.SaveCalls);
    }

    private static VuxoApiFactory CreateFactory(
        out FakeWorldRepository repository,
        out FakeUnitOfWork unitOfWork)
    {
        repository = new FakeWorldRepository();
        unitOfWork = new FakeUnitOfWork();
        var repositoryInstance = repository;
        var unitOfWorkInstance = unitOfWork;

        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IWorldRepository>();
            services.RemoveAll<IUnitOfWork>();
            services.AddSingleton<IWorldRepository>(repositoryInstance);
            services.AddSingleton<IUnitOfWork>(unitOfWorkInstance);
        });
    }

    private static async Task AuthenticateAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = "world-player",
            displayName = "World Player",
            role = "User"
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", payload.AccessToken);
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }

    private sealed class FakeWorldRepository : IWorldRepository
    {
        private readonly Dictionary<string, WorldDefinition> _definitions = new(StringComparer.Ordinal);
        private readonly Dictionary<(string WorldId, int X, int Y), WorldChunkMetadata> _chunks = new();

        public Task<WorldDefinition?> GetDefinitionAsync(string worldId, CancellationToken cancellationToken = default)
        {
            _definitions.TryGetValue(worldId, out var definition);
            return Task.FromResult(definition);
        }

        public Task<WorldChunkMetadata?> GetChunkAsync(
            string worldId,
            ChunkCoordinate coordinate,
            CancellationToken cancellationToken = default)
        {
            _chunks.TryGetValue((worldId, coordinate.X, coordinate.Y), out var chunk);
            return Task.FromResult(chunk);
        }

        public Task AddDefinitionAsync(WorldDefinition definition, CancellationToken cancellationToken = default)
        {
            _definitions[definition.WorldId] = definition;
            return Task.CompletedTask;
        }

        public Task AddChunkAsync(WorldChunkMetadata chunk, CancellationToken cancellationToken = default)
        {
            _chunks[(chunk.WorldId, chunk.Coordinate.X, chunk.Coordinate.Y)] = chunk;
            return Task.CompletedTask;
        }
    }
}
