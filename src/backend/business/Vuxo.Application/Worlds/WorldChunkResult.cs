using Vuxo.Domain.Worlds;

namespace Vuxo.Application.Worlds;

public sealed record WorldChunkResult(
    WorldDefinition Definition,
    GeneratedChunk Chunk,
    DateTimeOffset MaterializedAtUtc,
    bool NewlyMaterialized);
