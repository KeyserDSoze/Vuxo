namespace Vuxo.Domain.Worlds;

public static class WorldGenerationRules
{
    public const int CurrentGeneratorVersion = 1;
    public const int ChunkSize = 16;
    // Inclusive chunk radius around the origin: bounds persisted metadata and the runtime cache.
    public const int MaxChunkExtent = 256;
    internal const int NoiseCellSize = 8;
}

public static class TileRules
{
    public static bool IsWalkable(TileKind kind) => kind switch
    {
        TileKind.Water => false,
        TileKind.Sand or TileKind.Grass or TileKind.Stone or TileKind.Path => true,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown tile kind.")
    };
}
