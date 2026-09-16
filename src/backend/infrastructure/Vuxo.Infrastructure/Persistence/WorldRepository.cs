using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Worlds;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class WorldRepository(VuxoDbContext dbContext) : IWorldRepository
{
    public async Task<WorldDefinition?> GetDefinitionAsync(string worldId, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.WorldDefinitions
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.WorldId == worldId, cancellationToken);

        return entity is null
            ? null
            : WorldDefinition.Rehydrate(entity.WorldId, entity.Seed, entity.GeneratorVersion, entity.CreatedAtUtc);
    }

    public async Task<WorldChunkMetadata?> GetChunkAsync(
        string worldId,
        ChunkCoordinate coordinate,
        CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.WorldChunks
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.WorldId == worldId && item.ChunkX == coordinate.X && item.ChunkY == coordinate.Y,
                cancellationToken);

        return entity is null
            ? null
            : WorldChunkMetadata.Rehydrate(
                entity.WorldId,
                new ChunkCoordinate(entity.ChunkX, entity.ChunkY),
                entity.Fingerprint,
                entity.MaterializedAtUtc);
    }

    public async Task AddDefinitionAsync(WorldDefinition definition, CancellationToken cancellationToken = default)
    {
        await dbContext.WorldDefinitions.AddAsync(new WorldDefinitionEntity
        {
            WorldId = definition.WorldId,
            Seed = definition.Seed,
            GeneratorVersion = definition.GeneratorVersion,
            CreatedAtUtc = definition.CreatedAtUtc
        }, cancellationToken);
    }

    public async Task AddChunkAsync(WorldChunkMetadata chunk, CancellationToken cancellationToken = default)
    {
        await dbContext.WorldChunks.AddAsync(new WorldChunkEntity
        {
            WorldId = chunk.WorldId,
            ChunkX = chunk.Coordinate.X,
            ChunkY = chunk.Coordinate.Y,
            Fingerprint = chunk.Fingerprint,
            MaterializedAtUtc = chunk.MaterializedAtUtc
        }, cancellationToken);
    }
}
