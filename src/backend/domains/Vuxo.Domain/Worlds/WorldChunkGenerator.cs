using System.Security.Cryptography;
using System.Text;

namespace Vuxo.Domain.Worlds;

public sealed class WorldChunkGenerator
{
    private const long FixedScale = 256;
    private const ulong TerrainSalt = 0xA0761D6478BD642FUL;
    private const ulong VerticalEdgeSalt = 0xE7037ED1A0B428DBUL;
    private const ulong HorizontalEdgeSalt = 0x8EBC6AF09C88C6E3UL;

    public GeneratedChunk Generate(
        long seed,
        ChunkCoordinate coordinate,
        int generatorVersion = WorldGenerationRules.CurrentGeneratorVersion)
    {
        EnsureSupportedVersion(generatorVersion);

        var tiles = new WorldTile[WorldGenerationRules.ChunkSize * WorldGenerationRules.ChunkSize];
        for (var localY = 0; localY < WorldGenerationRules.ChunkSize; localY++)
        {
            for (var localX = 0; localX < WorldGenerationRules.ChunkSize; localX++)
            {
                var worldX = coordinate.ToWorldX(localX);
                var worldY = coordinate.ToWorldY(localY);
                var kind = GenerateTerrainKind(seed, generatorVersion, worldX, worldY);
                tiles[(localY * WorldGenerationRules.ChunkSize) + localX] = new WorldTile(
                    localX,
                    localY,
                    worldX,
                    worldY,
                    kind,
                    TileRules.IsWalkable(kind));
            }
        }

        ApplySharedEdgeGates(tiles, seed, generatorVersion, coordinate);
        var fingerprint = BuildFingerprint(seed, generatorVersion, coordinate, tiles);

        return new GeneratedChunk(seed, generatorVersion, coordinate, tiles, fingerprint);
    }

    private static TileKind GenerateTerrainKind(long seed, int version, long worldX, long worldY)
    {
        var value = SampleTerrain(seed, version, worldX, worldY);
        return value switch
        {
            < 18_000 => TileKind.Water,
            < 23_000 => TileKind.Sand,
            < 50_000 => TileKind.Grass,
            _ => TileKind.Stone
        };
    }

    private static int SampleTerrain(long seed, int version, long worldX, long worldY)
    {
        var gridX = FloorDivide(worldX, WorldGenerationRules.NoiseCellSize);
        var gridY = FloorDivide(worldY, WorldGenerationRules.NoiseCellSize);
        var remainderX = FloorModulo(worldX, WorldGenerationRules.NoiseCellSize);
        var remainderY = FloorModulo(worldY, WorldGenerationRules.NoiseCellSize);

        var tx = SmoothFixed((remainderX * FixedScale) / WorldGenerationRules.NoiseCellSize);
        var ty = SmoothFixed((remainderY * FixedScale) / WorldGenerationRules.NoiseCellSize);

        var topLeft = ToUnit16(StableHash(seed, version, gridX, gridY, TerrainSalt));
        var topRight = ToUnit16(StableHash(seed, version, gridX + 1, gridY, TerrainSalt));
        var bottomLeft = ToUnit16(StableHash(seed, version, gridX, gridY + 1, TerrainSalt));
        var bottomRight = ToUnit16(StableHash(seed, version, gridX + 1, gridY + 1, TerrainSalt));

        var top = LerpFixed(topLeft, topRight, tx);
        var bottom = LerpFixed(bottomLeft, bottomRight, tx);
        return LerpFixed(top, bottom, ty);
    }

    private static void ApplySharedEdgeGates(
        WorldTile[] tiles,
        long seed,
        int version,
        ChunkCoordinate coordinate)
    {
        var westGate = EdgeOffset(seed, version, vertical: true, coordinate.X, coordinate.Y);
        SetPath(tiles, coordinate, 0, westGate);
        SetPath(tiles, coordinate, 1, westGate);

        var eastGate = EdgeOffset(seed, version, vertical: true, (long)coordinate.X + 1, coordinate.Y);
        SetPath(tiles, coordinate, WorldGenerationRules.ChunkSize - 1, eastGate);
        SetPath(tiles, coordinate, WorldGenerationRules.ChunkSize - 2, eastGate);

        var northGate = EdgeOffset(seed, version, vertical: false, coordinate.Y, coordinate.X);
        SetPath(tiles, coordinate, northGate, 0);
        SetPath(tiles, coordinate, northGate, 1);

        var southGate = EdgeOffset(seed, version, vertical: false, (long)coordinate.Y + 1, coordinate.X);
        SetPath(tiles, coordinate, southGate, WorldGenerationRules.ChunkSize - 1);
        SetPath(tiles, coordinate, southGate, WorldGenerationRules.ChunkSize - 2);
    }

    private static int EdgeOffset(long seed, int version, bool vertical, long boundaryCoordinate, long segmentCoordinate)
    {
        var salt = vertical ? VerticalEdgeSalt : HorizontalEdgeSalt;
        var hash = StableHash(seed, version, boundaryCoordinate, segmentCoordinate, salt);
        return 2 + (int)(hash % (ulong)(WorldGenerationRules.ChunkSize - 4));
    }

    private static void SetPath(WorldTile[] tiles, ChunkCoordinate coordinate, int localX, int localY)
    {
        var index = (localY * WorldGenerationRules.ChunkSize) + localX;
        tiles[index] = new WorldTile(
            localX,
            localY,
            coordinate.ToWorldX(localX),
            coordinate.ToWorldY(localY),
            TileKind.Path,
            TileRules.IsWalkable(TileKind.Path));
    }

    private static string BuildFingerprint(
        long seed,
        int version,
        ChunkCoordinate coordinate,
        IReadOnlyList<WorldTile> tiles)
    {
        var canonical = new StringBuilder();
        canonical
            .Append("v=").Append(version)
            .Append(";seed=").Append(seed)
            .Append(";x=").Append(coordinate.X)
            .Append(";y=").Append(coordinate.Y)
            .Append(';');

        foreach (var tile in tiles)
        {
            canonical
                .Append((int)tile.Kind)
                .Append(':')
                .Append(tile.IsWalkable ? '1' : '0')
                .Append(';');
        }

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(canonical.ToString()));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private static int SmoothFixed(long t) =>
        (int)((t * t * ((3 * FixedScale) - (2 * t))) / (FixedScale * FixedScale));

    private static int LerpFixed(int start, int end, int t) =>
        start + (int)(((long)(end - start) * t) / FixedScale);

    private static int ToUnit16(ulong value) => (int)(value >> 48);

    private static long FloorDivide(long value, int divisor)
    {
        var quotient = value / divisor;
        var remainder = value % divisor;
        return remainder < 0 ? quotient - 1 : quotient;
    }

    private static long FloorModulo(long value, int divisor)
    {
        var remainder = value % divisor;
        return remainder < 0 ? remainder + divisor : remainder;
    }

    private static ulong StableHash(long seed, int version, long x, long y, ulong salt)
    {
        unchecked
        {
            var value = (ulong)seed;
            value ^= 0x9E3779B97F4A7C15UL + ((ulong)version * 0xBF58476D1CE4E5B9UL);
            value ^= (ulong)x * 0x94D049BB133111EBUL;
            value = Mix(value);
            value ^= (ulong)y * 0xD6E8FEB86659FD93UL;
            return Mix(value ^ salt);
        }
    }

    private static ulong Mix(ulong value)
    {
        unchecked
        {
            value += 0x9E3779B97F4A7C15UL;
            value = (value ^ (value >> 30)) * 0xBF58476D1CE4E5B9UL;
            value = (value ^ (value >> 27)) * 0x94D049BB133111EBUL;
            return value ^ (value >> 31);
        }
    }

    private static void EnsureSupportedVersion(int version)
    {
        if (version != WorldGenerationRules.CurrentGeneratorVersion)
        {
            throw new NotSupportedException($"World generator version {version} is not supported.");
        }
    }
}
