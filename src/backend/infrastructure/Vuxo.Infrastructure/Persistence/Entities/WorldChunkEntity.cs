namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class WorldChunkEntity
{
    public required string WorldId { get; set; }
    public int ChunkX { get; set; }
    public int ChunkY { get; set; }
    public required string Fingerprint { get; set; }
    public DateTimeOffset MaterializedAtUtc { get; set; }
}
