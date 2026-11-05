using Vuxo.Domain.Activities;

namespace Vuxo.Domain.Tests.Activities;

public sealed class OffworldActivityRulesTests
{
    [Fact]
    public void Catalog_HasStableUniqueKeysAndNoClientGrantedRewards()
    {
        Assert.Equal("offworld-activities-v1", OffworldActivityCatalog.Version);
        Assert.Equal(new[] { "rune-memory", "rune-reflex", "rune-path" },
            OffworldActivityCatalog.All.Select(x => x.Key));
        Assert.Equal(OffworldActivityCatalog.All.Count,
            OffworldActivityCatalog.All.Select(x => x.Key).Distinct().Count());
        Assert.All(OffworldActivityCatalog.All, definition =>
        {
            Assert.Equal(OffworldActivityCatalog.PracticeOnly, definition.Verification);
            Assert.False(definition.RewardsEnabled);
            Assert.False(string.IsNullOrWhiteSpace(definition.RulesVersion));
        });
        Assert.Null(OffworldActivityCatalog.Find("NOT-A-REAL-ACTIVITY"));
        Assert.Null(OffworldActivityCatalog.Find(null));
        Assert.Equal(RunePathPracticeRules.Version,
            OffworldActivityCatalog.Find("rune-path")?.RulesVersion);
    }

    [Theory]
    [InlineData(0, "DDDRRR")]
    [InlineData(1, "RRRDDD")]
    [InlineData(2, "DDRRDR")]
    public void FixedPuzzle_ValidRouteReachesGoal(int puzzleIndex, string solution)
    {
        var result = RunePathPracticeRules.Verify(puzzleIndex, solution);
        Assert.True(result.Solved);
        Assert.Equal("activity_path_solved", result.Code);
        Assert.Equal(6, result.StepsChecked);
    }

    [Theory]
    [InlineData(0, "U", "activity_path_blocked")]
    [InlineData(0, "R", "activity_path_blocked")]
    [InlineData(0, "DR", "activity_path_blocked")]
    [InlineData(1, "D", "activity_path_blocked")]
    [InlineData(2, "DDR", "activity_path_blocked")]
    [InlineData(0, "D", "activity_path_incomplete")]
    [InlineData(0, "X", "activity_path_direction_invalid")]
    [InlineData(0, "DDDRRRU", "activity_path_extra_moves")]
    [InlineData(0, "", "activity_path_length_invalid")]
    public void CannotSubmitInvalidOrTeleportingPath(int puzzleIndex,
        string moves, string code)
    {
        var result = RunePathPracticeRules.Verify(puzzleIndex, moves);
        Assert.False(result.Solved);
        Assert.Equal(code, result.Code);
    }

    [Fact]
    public void UnboundedInputAndUnknownPuzzle_AreRejectedBeforeEvaluation()
    {
        Assert.Equal("activity_path_length_invalid",
            RunePathPracticeRules.Verify(0, new string('D', 33)).Code);
        Assert.Equal("activity_path_length_invalid",
            RunePathPracticeRules.Verify(0, null).Code);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            RunePathPracticeRules.Verify(-1, "DDDRRR"));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            RunePathPracticeRules.Verify(3, "DDDRRR"));
    }

    [Fact]
    public void WallDefinitions_AreDeterministicAndDefensivelyCopied()
    {
        var original = RunePathPracticeRules.GetWalls(0);
        Assert.Contains((1, 0), original);
        Assert.Contains((2, 2), original);
        Assert.Equal(4, original.Count);
        var second = RunePathPracticeRules.GetWalls(0);
        Assert.Equal(original, second);
        Assert.IsNotType<(int X, int Y)[]>(original);
    }
}
