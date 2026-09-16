namespace Vuxo.Domain.Worlds;

public interface IWorldRepository
{
    Task<WorldDefinition?> GetDefinitionAsync(string worldId, CancellationToken cancellationToken = default);
    Task<WorldChunkMetadata?> GetChunkAsync(string worldId, ChunkCoordinate coordinate, CancellationToken cancellationToken = default);
    Task AddDefinitionAsync(WorldDefinition definition, CancellationToken cancellationToken = default);
    Task AddChunkAsync(WorldChunkMetadata chunk, CancellationToken cancellationToken = default);
}
