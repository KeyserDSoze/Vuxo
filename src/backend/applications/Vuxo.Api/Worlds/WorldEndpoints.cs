using Microsoft.EntityFrameworkCore;
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
                IServiceScopeFactory scopeFactory,
                CancellationToken cancellationToken) =>
            {
                var coordinate = new ChunkCoordinate(chunkX, chunkY);
                if (!coordinate.IsWithinWorld)
                {
                    return Results.BadRequest(new { code = "world_chunk_out_of_range" });
                }

                try
                {
                    var result = await MaterializeAsync(scopeFactory, bootstrap, coordinate, cancellationToken);
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
            .RequireAuthorization()
            .RequireRateLimiting("world-chunk");

        return endpoints;
    }

    // A concurrent first request can win the unique insert; the retry runs in a fresh scope and reads the winner's row.
    private static async Task<WorldChunkResult> MaterializeAsync(
        IServiceScopeFactory scopeFactory,
        WorldBootstrapSpec bootstrap,
        ChunkCoordinate coordinate,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<WorldService>();
            try
            {
                return await service.GetOrMaterializeChunkAsync(bootstrap, coordinate, cancellationToken);
            }
            catch (DbUpdateException) when (attempt < 2)
            {
            }
        }
    }
}
