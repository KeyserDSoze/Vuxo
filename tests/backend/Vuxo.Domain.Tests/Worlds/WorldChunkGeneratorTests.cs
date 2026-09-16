using Vuxo.Domain.Worlds;

namespace Vuxo.Domain.Tests.Worlds;

public sealed class WorldChunkGeneratorTests
{
    private readonly WorldChunkGenerator _generator = new();

    [Fact]
    public void Generate_WithSameSeedAndCoordinate_IsExactlyReproducible()
    {
        var coordinate = new ChunkCoordinate(12, -7);

        var first = _generator.Generate(918_273_645, coordinate);
        var second = _generator.Generate(918_273_645, coordinate);

        Assert.Equal(first.Fingerprint, second.Fingerprint);
        Assert.Equal(first.Tiles.ToArray(), second.Tiles.ToArray());
    }

    [Fact]
    public void Generate_WithDifferentSeed_ChangesChunkFingerprint()
    {
        var coordinate = new ChunkCoordinate(3, 4);

        var first = _generator.Generate(111, coordinate);
        var second = _generator.Generate(222, coordinate);

        Assert.NotEqual(first.Fingerprint, second.Fingerprint);
    }

    [Theory]
    [InlineData(TileKind.Water, false)]
    [InlineData(TileKind.Sand, true)]
    [InlineData(TileKind.Grass, true)]
    [InlineData(TileKind.Stone, true)]
    [InlineData(TileKind.Path, true)]
    public void TileRules_DefineWalkabilityIndependentlyFromRendering(TileKind kind, bool expected)
    {
        Assert.Equal(expected, TileRules.IsWalkable(kind));
    }

    [Fact]
    public void Generate_AdjacentChunksShareTheSameVerticalGate()
    {
        const long seed = 424_242;
        var west = _generator.Generate(seed, new ChunkCoordinate(-3, 5));
        var east = _generator.Generate(seed, new ChunkCoordinate(-2, 5));

        var westGate = Assert.Single(west.Tiles.Where(tile =>
            tile.LocalX == WorldGenerationRules.ChunkSize - 1 && tile.Kind == TileKind.Path));
        var eastGate = Assert.Single(east.Tiles.Where(tile =>
            tile.LocalX == 0 && tile.Kind == TileKind.Path));

        Assert.Equal(westGate.LocalY, eastGate.LocalY);
        Assert.Equal(westGate.WorldX + 1, eastGate.WorldX);
        Assert.Equal(westGate.WorldY, eastGate.WorldY);
        Assert.True(westGate.IsWalkable);
        Assert.True(eastGate.IsWalkable);
    }

    [Fact]
    public void Generate_AdjacentChunksShareTheSameHorizontalGate()
    {
        const long seed = 771_199;
        var north = _generator.Generate(seed, new ChunkCoordinate(6, -4));
        var south = _generator.Generate(seed, new ChunkCoordinate(6, -3));

        var northGate = Assert.Single(north.Tiles.Where(tile =>
            tile.LocalY == WorldGenerationRules.ChunkSize - 1 && tile.Kind == TileKind.Path));
        var southGate = Assert.Single(south.Tiles.Where(tile =>
            tile.LocalY == 0 && tile.Kind == TileKind.Path));

        Assert.Equal(northGate.LocalX, southGate.LocalX);
        Assert.Equal(northGate.WorldY + 1, southGate.WorldY);
        Assert.Equal(northGate.WorldX, southGate.WorldX);
    }

    [Fact]
    public void Generate_MapsLocalCoordinatesToContiguousWorldCoordinates()
    {
        var chunk = _generator.Generate(5, new ChunkCoordinate(-2, 3));

        Assert.Equal(WorldGenerationRules.ChunkSize * WorldGenerationRules.ChunkSize, chunk.Tiles.Count);
        Assert.Equal(-32, chunk.GetTile(0, 0).WorldX);
        Assert.Equal(48, chunk.GetTile(0, 0).WorldY);
        Assert.Equal(-17, chunk.GetTile(15, 15).WorldX);
        Assert.Equal(63, chunk.GetTile(15, 15).WorldY);
    }

    [Fact]
    public void Generate_CurrentVersion_MatchesRegressionFixture()
    {
        var chunk = _generator.Generate(424_242, new ChunkCoordinate(0, 0));

        Assert.Equal(WorldGenerationRules.CurrentGeneratorVersion, chunk.GeneratorVersion);
        Assert.Equal("f5b1856453d59fa2cfe894bc2a52101c4503dc09cb2b36c3e0a4619a644c69f6", chunk.Fingerprint);
    }

    [Fact]
    public void Generate_WithUnsupportedVersion_FailsExplicitly()
    {
        Assert.Throws<NotSupportedException>(() =>
            _generator.Generate(42, new ChunkCoordinate(0, 0), WorldGenerationRules.CurrentGeneratorVersion + 1));
    }
}
