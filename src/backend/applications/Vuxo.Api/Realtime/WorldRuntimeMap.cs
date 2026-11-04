using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Worlds;

namespace Vuxo.Api.Realtime;

public sealed class WorldRuntimeMap(
    IServiceScopeFactory scopeFactory,
    WorldBootstrapSpec bootstrap) : IWorldPortalMap
{
    private readonly ConcurrentDictionary<ChunkCoordinate, Lazy<Task<WorldChunkResult>>> _chunks = new();

    public async Task<WorldSpawnPoint> GetSpawnPointAsync(CancellationToken cancellationToken = default)
    {
        var result = await GetChunkAsync(new ChunkCoordinate(0, 0), cancellationToken);

        foreach (var tile in result.Chunk.Tiles)
        {
            if (tile.Kind == TileKind.Path && tile.IsWalkable)
            {
                return new WorldSpawnPoint(tile.WorldX + 0.5d, tile.WorldY + 0.5d);
            }
        }

        foreach (var tile in result.Chunk.Tiles)
        {
            if (tile.IsWalkable)
            {
                return new WorldSpawnPoint(tile.WorldX + 0.5d, tile.WorldY + 0.5d);
            }
        }

        throw new InvalidOperationException("The initial world chunk does not contain a walkable spawn tile.");
    }

    public async ValueTask<bool> IsWalkableAsync(
        double worldX,
        double worldY,
        CancellationToken cancellationToken = default)
    {
        if (!double.IsFinite(worldX) || !double.IsFinite(worldY))
        {
            return false;
        }

        var flooredX = Math.Floor(worldX);
        var flooredY = Math.Floor(worldY);
        if (flooredX < int.MinValue || flooredX > int.MaxValue
            || flooredY < int.MinValue || flooredY > int.MaxValue)
        {
            return false;
        }

        var tileX = (int)flooredX;
        var tileY = (int)flooredY;
        var chunkX = FloorDivide(tileX, WorldGenerationRules.ChunkSize);
        var chunkY = FloorDivide(tileY, WorldGenerationRules.ChunkSize);
        var localX = PositiveModulo(tileX, WorldGenerationRules.ChunkSize);
        var localY = PositiveModulo(tileY, WorldGenerationRules.ChunkSize);

        var result = await GetChunkAsync(new ChunkCoordinate(chunkX, chunkY), cancellationToken);
        return result.Chunk.GetTile(localX, localY).IsWalkable;
    }

    private async Task<WorldChunkResult> GetChunkAsync(
        ChunkCoordinate coordinate,
        CancellationToken cancellationToken)
    {
        var lazy = _chunks.GetOrAdd(
            coordinate,
            static (key, state) => new Lazy<Task<WorldChunkResult>>(
                () => state.LoadChunkAsync(key),
                LazyThreadSafetyMode.ExecutionAndPublication),
            this);

        var loadTask = lazy.Value;
        try
        {
            return await loadTask.WaitAsync(cancellationToken);
        }
        catch when (loadTask.IsFaulted)
        {
            _chunks.TryRemove(coordinate, out _);
            throw;
        }
    }

    private async Task<WorldChunkResult> LoadChunkAsync(ChunkCoordinate coordinate)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var service = scope.ServiceProvider.GetRequiredService<WorldService>();
        return await service.GetOrMaterializeChunkAsync(bootstrap, coordinate, CancellationToken.None);
    }

    private static int FloorDivide(int value, int divisor)
    {
        var quotient = Math.DivRem(value, divisor, out var remainder);
        return remainder < 0 ? quotient - 1 : quotient;
    }

    private static int PositiveModulo(int value, int divisor)
    {
        var remainder = value % divisor;
        return remainder < 0 ? remainder + divisor : remainder;
    }
}
