using Vuxo.Application.Worlds;
using Vuxo.Domain.Worlds;

namespace Vuxo.Api.Worlds;

public static class WorldEndpoints
{
    public static IEndpointRouteBuilder MapWorldEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(
            "/api/world/chunks/{chunkX:int}/{chunkY:int}",
            async (
                int chunkX,
                int chunkY,
                WorldBootstrapSpec bootstrap,
                WorldService service,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var result = await service.GetOrMaterializeChunkAsync(
                        bootstrap,
                        new ChunkCoordinate(chunkX, chunkY),
                        cancellationToken);

                    return Results.Ok(new
                    {
                        worldId = result.Definition.WorldId,
                        generatorVersion = result.Definition.GeneratorVersion,
                        chunk = new
                        {
                            x = result.Chunk.Coordinate.X,
                            y = result.Chunk.Coordinate.Y,
                            size = WorldGenerationRules.ChunkSize,
                            fingerprint = result.Chunk.Fingerprint,
                            materializedAtUtc = result.MaterializedAtUtc,
                            newlyMaterialized = result.NewlyMaterialized,
                            tiles = result.Chunk.Tiles.Select(tile => new
                            {
                                tile.LocalX,
                                tile.LocalY,
                                tile.WorldX,
                                tile.WorldY,
                                kind = tile.Kind.ToString().ToLowerInvariant(),
                                tile.IsWalkable
                            })
                        }
                    });
                }
                catch (WorldGenerationDivergenceException)
                {
                    return Results.Json(
                        new { code = "world_chunk_generation_diverged" },
                        statusCode: StatusCodes.Status500InternalServerError);
                }
                catch (NotSupportedException)
                {
                    return Results.Json(
                        new { code = "world_generator_version_unsupported" },
                        statusCode: StatusCodes.Status500InternalServerError);
                }
            })
            .RequireAuthorization();

        return endpoints;
    }
}
