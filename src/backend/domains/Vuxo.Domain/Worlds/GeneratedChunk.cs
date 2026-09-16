namespace Vuxo.Domain.Worlds;

public sealed record GeneratedChunk(
    long Seed,
    int GeneratorVersion,
    ChunkCoordinate Coordinate,
    IReadOnlyList<WorldTile> Tiles,
    string Fingerprint)
{
    public WorldTile GetTile(int localX, int localY)
    {
        if (localX < 0 || localX >= WorldGenerationRules.ChunkSize)
        {
            throw new ArgumentOutOfRangeException(nameof(localX));
        }

        if (localY < 0 || localY >= WorldGenerationRules.ChunkSize)
        {
            throw new ArgumentOutOfRangeException(nameof(localY));
        }

        return Tiles[(localY * WorldGenerationRules.ChunkSize) + localX];
    }
}
