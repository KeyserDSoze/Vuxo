namespace Vuxo.Domain.Worlds;

public sealed record WorldChunkMetadata
{
    private WorldChunkMetadata(
        string worldId,
        ChunkCoordinate coordinate,
        string fingerprint,
        DateTimeOffset materializedAtUtc)
    {
        WorldId = worldId;
        Coordinate = coordinate;
        Fingerprint = fingerprint;
        MaterializedAtUtc = materializedAtUtc;
    }

    public string WorldId { get; }
    public ChunkCoordinate Coordinate { get; }
    public string Fingerprint { get; }
    public DateTimeOffset MaterializedAtUtc { get; }

    public static WorldChunkMetadata Create(
        string worldId,
        ChunkCoordinate coordinate,
        string fingerprint,
        DateTimeOffset materializedAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(worldId);
        ArgumentException.ThrowIfNullOrWhiteSpace(fingerprint);

        var normalizedWorldId = worldId.Trim();
        if (normalizedWorldId.Length > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(worldId), "World id must be at most 100 characters.");
        }

        var normalizedFingerprint = fingerprint.Trim().ToLowerInvariant();
        if (normalizedFingerprint.Length != 64 || normalizedFingerprint.Any(character => !Uri.IsHexDigit(character)))
        {
            throw new ArgumentException("Chunk fingerprint must be a 64-character SHA-256 hex string.", nameof(fingerprint));
        }

        return new WorldChunkMetadata(normalizedWorldId, coordinate, normalizedFingerprint, materializedAtUtc);
    }

    public static WorldChunkMetadata Rehydrate(
        string worldId,
        ChunkCoordinate coordinate,
        string fingerprint,
        DateTimeOffset materializedAtUtc) =>
        Create(worldId, coordinate, fingerprint, materializedAtUtc);
}
