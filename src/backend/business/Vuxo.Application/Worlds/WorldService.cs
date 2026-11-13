using Vuxo.Domain.Common;
using Vuxo.Domain.Worlds;

namespace Vuxo.Application.Worlds;

public sealed class WorldService(
    IWorldRepository repository,
    IUnitOfWork unitOfWork,
    WorldChunkGenerator generator,
    TimeProvider timeProvider)
{
    public async Task<WorldChunkResult> GetOrMaterializeChunkAsync(
        WorldBootstrapSpec bootstrap,
        ChunkCoordinate coordinate,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(bootstrap);
        ArgumentException.ThrowIfNullOrWhiteSpace(bootstrap.WorldId);
        if (!coordinate.IsWithinWorld)
        {
            throw new ArgumentOutOfRangeException(nameof(coordinate), coordinate, "Chunk is outside the bounded world.");
        }
        if (bootstrap.GeneratorVersion <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(bootstrap), "Generator version must be positive.");
        }

        var worldId = bootstrap.WorldId.Trim();
        var definition = await repository.GetDefinitionAsync(worldId, cancellationToken);
        var definitionIsNew = definition is null;

        if (definition is null)
        {
            definition = WorldDefinition.Create(
                worldId,
                bootstrap.Seed,
                bootstrap.GeneratorVersion,
                timeProvider.GetUtcNow());
            await repository.AddDefinitionAsync(definition, cancellationToken);
        }

        var generated = generator.Generate(definition.Seed, coordinate, definition.GeneratorVersion);
        var existingChunk = await repository.GetChunkAsync(worldId, coordinate, cancellationToken);
        if (existingChunk is not null)
        {
            if (!string.Equals(existingChunk.Fingerprint, generated.Fingerprint, StringComparison.Ordinal))
            {
                throw new WorldGenerationDivergenceException(
                    worldId,
                    coordinate,
                    existingChunk.Fingerprint,
                    generated.Fingerprint);
            }

            if (definitionIsNew)
            {
                throw new InvalidOperationException("A materialized chunk cannot exist without its world definition.");
            }

            return new WorldChunkResult(definition, generated, existingChunk.MaterializedAtUtc, NewlyMaterialized: false);
        }

        var metadata = WorldChunkMetadata.Create(
            worldId,
            coordinate,
            generated.Fingerprint,
            timeProvider.GetUtcNow());
        await repository.AddChunkAsync(metadata, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new WorldChunkResult(definition, generated, metadata.MaterializedAtUtc, NewlyMaterialized: true);
    }
}
