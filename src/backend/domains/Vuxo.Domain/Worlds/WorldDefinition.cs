namespace Vuxo.Domain.Worlds;

public sealed record WorldDefinition
{
    private WorldDefinition(string worldId, long seed, int generatorVersion, DateTimeOffset createdAtUtc)
    {
        WorldId = worldId;
        Seed = seed;
        GeneratorVersion = generatorVersion;
        CreatedAtUtc = createdAtUtc;
    }

    public string WorldId { get; }
    public long Seed { get; }
    public int GeneratorVersion { get; }
    public DateTimeOffset CreatedAtUtc { get; }

    public static WorldDefinition Create(string worldId, long seed, int generatorVersion, DateTimeOffset createdAtUtc)
    {
        Validate(worldId, generatorVersion);
        return new WorldDefinition(worldId.Trim(), seed, generatorVersion, createdAtUtc);
    }

    public static WorldDefinition Rehydrate(string worldId, long seed, int generatorVersion, DateTimeOffset createdAtUtc) =>
        Create(worldId, seed, generatorVersion, createdAtUtc);

    private static void Validate(string worldId, int generatorVersion)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(worldId);
        if (worldId.Trim().Length > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(worldId), "World id must be at most 100 characters.");
        }

        if (generatorVersion <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(generatorVersion), "Generator version must be positive.");
        }
    }
}
