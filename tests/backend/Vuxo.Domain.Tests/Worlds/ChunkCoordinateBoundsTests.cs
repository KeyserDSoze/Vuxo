using Vuxo.Domain.Worlds;

namespace Vuxo.Domain.Tests.Worlds;

public sealed class ChunkCoordinateBoundsTests
{
    private const int Extent = WorldGenerationRules.MaxChunkExtent;

    [Theory]
    [InlineData(0, 0, true)]
    [InlineData(Extent, Extent, true)]
    [InlineData(-Extent, -Extent, true)]
    [InlineData(Extent, -Extent, true)]
    [InlineData(Extent + 1, 0, false)]
    [InlineData(0, Extent + 1, false)]
    [InlineData(-Extent - 1, 0, false)]
    [InlineData(0, -Extent - 1, false)]
    [InlineData(int.MaxValue, int.MaxValue, false)]
    [InlineData(int.MinValue, int.MinValue, false)]
    public void IsWithinWorld_UsesInclusiveSymmetricExtent(int x, int y, bool expected)
    {
        Assert.Equal(expected, new ChunkCoordinate(x, y).IsWithinWorld);
    }
}
