namespace Vuxo.Domain.Worlds;

public readonly record struct ChunkCoordinate(int X, int Y)
{
    public long ToWorldX(int localX) => ((long)X * WorldGenerationRules.ChunkSize) + ValidateLocal(localX, nameof(localX));

    public long ToWorldY(int localY) => ((long)Y * WorldGenerationRules.ChunkSize) + ValidateLocal(localY, nameof(localY));

    private static int ValidateLocal(int value, string parameterName)
    {
        if (value < 0 || value >= WorldGenerationRules.ChunkSize)
        {
            throw new ArgumentOutOfRangeException(parameterName, value, $"Local coordinates must be between 0 and {WorldGenerationRules.ChunkSize - 1}.");
        }

        return value;
    }
}
