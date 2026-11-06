namespace Vuxo.Domain.Activities;

/// <summary>
/// A read-only practice profile derived exclusively from server-verified,
/// persisted completions. These milestones are informational, not skill
/// credentials or entitlements: fixed boards can be solved by a bot.
/// </summary>
public static class OffworldPracticeProgressRules
{
    public const string MilestoneNewcomer = "newcomer";
    public const string MilestoneExplorer = "explorer";
    public const string MilestoneNavigator = "navigator";
    public const string MilestoneCartographer = "cartographer";
    public const string RewardBlockReason = "automatable_practice";

    public static OffworldPracticeProgress Build(
        IEnumerable<OffworldPracticeBoardAggregate> verifiedBoards)
    {
        ArgumentNullException.ThrowIfNull(verifiedBoards);
        // Defensive validation for materialized legacy rows. Only current,
        // server-verified board indices and valid step counts contribute.
        var boards = verifiedBoards
            .Where(x => x.PuzzleIndex >= 0 && x.PuzzleIndex < RunePathPracticeRules.PuzzleCount
                && x.CompletedRuns > 0
                && x.BestSteps > 0 && x.BestSteps <= RunePathPracticeRules.MaximumMoves)
            .GroupBy(x => x.PuzzleIndex)
            .Select(group => new OffworldPracticeBoardProgress(
                group.Key,
                group.Sum(x => x.CompletedRuns),
                group.Min(x => x.BestSteps)))
            .OrderBy(x => x.PuzzleIndex)
            .ToArray();

        var solved = boards.Length;
        var milestone = solved switch
        {
            >= RunePathPracticeRules.PuzzleCount => MilestoneCartographer,
            2 => MilestoneNavigator,
            1 => MilestoneExplorer,
            _ => MilestoneNewcomer
        };
        return new OffworldPracticeProgress(
            OffworldRunRules.ActivityKey,
            RunePathPracticeRules.Version,
            boards.Sum(x => x.CompletedRuns),
            solved,
            RunePathPracticeRules.PuzzleCount,
            milestone,
            boards,
            RewardsEnabled: false,
            XpGranted: 0,
            ItemsGranted: 0,
            RewardBlockReason: RewardBlockReason);
    }
}

public sealed record OffworldPracticeBoardAggregate(
    int PuzzleIndex, int CompletedRuns, int BestSteps);

public sealed record OffworldPracticeBoardProgress(
    int PuzzleIndex, int CompletedRuns, int BestSteps);

public sealed record OffworldPracticeProgress(
    string ActivityKey,
    string RulesVersion,
    int CompletedRuns,
    int BoardsSolved,
    int TotalBoards,
    string Milestone,
    IReadOnlyList<OffworldPracticeBoardProgress> Boards,
    bool RewardsEnabled,
    int XpGranted,
    int ItemsGranted,
    string RewardBlockReason);
