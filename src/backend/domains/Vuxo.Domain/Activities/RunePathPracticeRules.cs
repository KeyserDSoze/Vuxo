namespace Vuxo.Domain.Activities;

/// <summary>
/// Server-side route validator for three fixed, reproducible 4x4 Rune Path
/// practice boards. It verifies geometry, NOT whether a human played.
/// No reward may be granted from this result without a separate persisted
/// run, authorization, cooldown, idempotency and anti-abuse protocol.
/// </summary>
public static class RunePathPracticeRules
{
    public const string Version = "rune-path-practice-v1";
    public const int GridSize = 4;
    public const int MaximumMoves = 32;
    public const int PuzzleCount = 3;

    private static readonly IReadOnlyList<(int X, int Y)[]> Walls =
        Array.AsReadOnly(new (int X, int Y)[][]
        {
            [(1, 0), (1, 1), (2, 1), (2, 2)],
            [(0, 1), (1, 1), (2, 1), (2, 2)],
            [(1, 0), (1, 1), (2, 1), (1, 3), (3, 2)]
        });

    public static IReadOnlyList<(int X, int Y)> GetWalls(int puzzleIndex)
    {
        ValidatePuzzle(puzzleIndex);
        return Array.AsReadOnly(Walls[puzzleIndex].ToArray());
    }

    public static RunePathPracticeResult Verify(int puzzleIndex, string? moves)
    {
        ValidatePuzzle(puzzleIndex);
        if (string.IsNullOrEmpty(moves) || moves.Length > MaximumMoves)
            return new(false, "activity_path_length_invalid", 0);

        var x = 0;
        var y = 0;
        for (var index = 0; index < moves.Length; index++)
        {
            var (dx, dy) = moves[index] switch
            {
                'U' => (0, -1),
                'D' => (0, 1),
                'L' => (-1, 0),
                'R' => (1, 0),
                _ => (int.MinValue, int.MinValue)
            };
            if (dx == int.MinValue)
                return new(false, "activity_path_direction_invalid", index);

            var nextX = x + dx;
            var nextY = y + dy;
            if (nextX < 0 || nextY < 0 || nextX >= GridSize || nextY >= GridSize
                || Walls[puzzleIndex].Any(wall => wall.X == nextX && wall.Y == nextY))
                return new(false, "activity_path_blocked", index);

            x = nextX;
            y = nextY;
            if (x == GridSize - 1 && y == GridSize - 1)
                return index == moves.Length - 1
                    ? new(true, "activity_path_solved", index + 1)
                    : new(false, "activity_path_extra_moves", index + 1);
        }

        return new(false, "activity_path_incomplete", moves.Length);
    }

    private static void ValidatePuzzle(int puzzleIndex)
    {
        if (puzzleIndex < 0 || puzzleIndex >= PuzzleCount)
            throw new ArgumentOutOfRangeException(nameof(puzzleIndex));
    }
}

public sealed record RunePathPracticeResult(bool Solved, string Code, int StepsChecked);
