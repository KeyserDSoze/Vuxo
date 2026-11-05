using Vuxo.Domain.Activities;

namespace Vuxo.Api.Activities;

public static class ActivityCatalogEndpoints
{
    public static IEndpointRouteBuilder MapActivityCatalogEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        // Anonymous, read-only catalogue for local practice. A catalogue entry
        // is not an entitlement, and its geometry is never proof of skill.
        endpoints.MapGet("/api/activities/catalog", () => Results.Ok(new
        {
            catalogVersion = OffworldActivityCatalog.Version,
            activities = OffworldActivityCatalog.All
        }));

        endpoints.MapGet("/api/activities/rune-path/puzzles/{puzzleIndex:int}", (int puzzleIndex) =>
        {
            if (puzzleIndex < 0 || puzzleIndex >= RunePathPracticeRules.PuzzleCount)
                return Results.NotFound(new { code = "activity_puzzle_not_found" });

            return Results.Ok(new
            {
                rulesVersion = RunePathPracticeRules.Version,
                puzzleIndex,
                gridSize = RunePathPracticeRules.GridSize,
                start = new { x = 0, y = 0 },
                goal = new { x = RunePathPracticeRules.GridSize - 1,
                    y = RunePathPracticeRules.GridSize - 1 },
                walls = RunePathPracticeRules.GetWalls(puzzleIndex)
                    .Select(wall => new { x = wall.X, y = wall.Y })
            });
        });

        return endpoints;
    }
}
