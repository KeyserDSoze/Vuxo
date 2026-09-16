using Vuxo.Domain.Worlds;

namespace Vuxo.Application.Worlds;

public sealed class WorldGenerationDivergenceException : InvalidOperationException
{
    public WorldGenerationDivergenceException(
        string worldId,
        ChunkCoordinate coordinate,
        string persistedFingerprint,
        string generatedFingerprint)
        : base($"Generated chunk {worldId}/{coordinate.X}/{coordinate.Y} no longer matches persisted metadata.")
    {
        WorldId = worldId;
        Coordinate = coordinate;
        PersistedFingerprint = persistedFingerprint;
        GeneratedFingerprint = generatedFingerprint;
    }

    public string WorldId { get; }
    public ChunkCoordinate Coordinate { get; }
    public string PersistedFingerprint { get; }
    public string GeneratedFingerprint { get; }
}
