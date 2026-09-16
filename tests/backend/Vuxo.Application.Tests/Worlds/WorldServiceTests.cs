using Vuxo.Application.Worlds;
using Vuxo.Domain.Common;
using Vuxo.Domain.Worlds;

namespace Vuxo.Application.Tests.Worlds;

public sealed class WorldServiceTests
{
    private static readonly DateTimeOffset FixedNow = new(2026, 9, 16, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetOrMaterializeChunk_FirstAccess_PersistsWorldAndChunkMetadata()
    {
        var repository = new FakeWorldRepository();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, unitOfWork);

        var result = await service.GetOrMaterializeChunkAsync(
            new WorldBootstrapSpec("vuxo-prime", 424_242, WorldGenerationRules.CurrentGeneratorVersion),
            new ChunkCoordinate(0, 0));

        Assert.True(result.NewlyMaterialized);
        Assert.Equal(FixedNow, result.MaterializedAtUtc);
        Assert.Equal(424_242, result.Definition.Seed);
        Assert.Equal("f5b1856453d59fa2cfe894bc2a52101c4503dc09cb2b36c3e0a4619a644c69f6", result.Chunk.Fingerprint);
        Assert.NotNull(await repository.GetDefinitionAsync("vuxo-prime"));
        Assert.NotNull(await repository.GetChunkAsync("vuxo-prime", new ChunkCoordinate(0, 0)));
        Assert.Equal(1, unitOfWork.SaveCount);
    }

    [Fact]
    public async Task GetOrMaterializeChunk_RepeatedAccess_DoesNotRewriteMetadata()
    {
        var repository = new FakeWorldRepository();
        var unitOfWork = new FakeUnitOfWork();
        var service = CreateService(repository, unitOfWork);
        var bootstrap = new WorldBootstrapSpec("vuxo-prime", 77, WorldGenerationRules.CurrentGeneratorVersion);
        var coordinate = new ChunkCoordinate(8, -2);

        var first = await service.GetOrMaterializeChunkAsync(bootstrap, coordinate);
        var second = await service.GetOrMaterializeChunkAsync(bootstrap, coordinate);

        Assert.True(first.NewlyMaterialized);
        Assert.False(second.NewlyMaterialized);
        Assert.Equal(first.Chunk.Fingerprint, second.Chunk.Fingerprint);
        Assert.Equal(first.MaterializedAtUtc, second.MaterializedAtUtc);
        Assert.Equal(1, unitOfWork.SaveCount);
    }

    [Fact]
    public async Task GetOrMaterializeChunk_ExistingWorld_UsesPersistedSeedInsteadOfChangedBootstrapConfiguration()
    {
        var repository = new FakeWorldRepository();
        var unitOfWork = new FakeUnitOfWork();
        var persisted = WorldDefinition.Create(
            "vuxo-prime",
            123_456,
            WorldGenerationRules.CurrentGeneratorVersion,
            FixedNow.AddDays(-1));
        await repository.AddDefinitionAsync(persisted);
        var service = CreateService(repository, unitOfWork);

        var result = await service.GetOrMaterializeChunkAsync(
            new WorldBootstrapSpec("vuxo-prime", 999_999, WorldGenerationRules.CurrentGeneratorVersion),
            new ChunkCoordinate(1, 1));

        Assert.Equal(123_456, result.Definition.Seed);
        Assert.Equal(123_456, result.Chunk.Seed);
    }

    [Fact]
    public async Task GetOrMaterializeChunk_WhenPersistedFingerprintDiffers_ThrowsInsteadOfRewritingHistory()
    {
        var repository = new FakeWorldRepository();
        var unitOfWork = new FakeUnitOfWork();
        var definition = WorldDefinition.Create(
            "vuxo-prime",
            42,
            WorldGenerationRules.CurrentGeneratorVersion,
            FixedNow.AddDays(-2));
        await repository.AddDefinitionAsync(definition);
        await repository.AddChunkAsync(WorldChunkMetadata.Create(
            "vuxo-prime",
            new ChunkCoordinate(2, 3),
            new string('a', 64),
            FixedNow.AddDays(-1)));
        var service = CreateService(repository, unitOfWork);

        var exception = await Assert.ThrowsAsync<WorldGenerationDivergenceException>(() =>
            service.GetOrMaterializeChunkAsync(
                new WorldBootstrapSpec("vuxo-prime", 42, WorldGenerationRules.CurrentGeneratorVersion),
                new ChunkCoordinate(2, 3)));

        Assert.Equal("vuxo-prime", exception.WorldId);
        Assert.Equal(new ChunkCoordinate(2, 3), exception.Coordinate);
        Assert.Equal(0, unitOfWork.SaveCount);
    }

    private static WorldService CreateService(FakeWorldRepository repository, FakeUnitOfWork unitOfWork) =>
        new(repository, unitOfWork, new WorldChunkGenerator(), new FixedTimeProvider(FixedNow));

    private sealed class FixedTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => value;
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCount { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCount++;
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
