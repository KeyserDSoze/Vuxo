using Vuxo.Domain.Activities;
using Xunit;

namespace Vuxo.Domain.Tests.Activities;

public sealed class OffworldPracticeProgressRulesTests
{
    [Fact]
    public void EmptyPractice_OffersNoUnverifiedRewards()
    {
        var profile = OffworldPracticeProgressRules.Build([]);
        Assert.Equal("rune-path", profile.ActivityKey);
        Assert.Equal(RunePathPracticeRules.Version, profile.RulesVersion);
        Assert.Equal(0, profile.CompletedRuns);
        Assert.Equal(0, profile.BoardsSolved);
        Assert.Equal(3, profile.TotalBoards);
        Assert.Equal(OffworldPracticeProgressRules.MilestoneNewcomer, profile.Milestone);
        Assert.Empty(profile.Boards);
        Assert.False(profile.RewardsEnabled);
        Assert.Equal(0, profile.XpGranted);
        Assert.Equal(0, profile.ItemsGranted);
        Assert.Equal(OffworldPracticeProgressRules.RewardBlockReason, profile.RewardBlockReason);
    }

    [Theory]
    [InlineData(1, OffworldPracticeProgressRules.MilestoneExplorer)]
    [InlineData(2, OffworldPracticeProgressRules.MilestoneNavigator)]
    [InlineData(3, OffworldPracticeProgressRules.MilestoneCartographer)]
    public void UniqueBoards_AdvanceOnlyInformationMilestones(int boards, string expected)
    {
        var aggregates = Enumerable.Range(0, boards)
            .Select(index => new OffworldPracticeBoardAggregate(index, 3, 6));
        var profile = OffworldPracticeProgressRules.Build(aggregates);
        Assert.Equal(boards, profile.BoardsSolved);
        Assert.Equal(boards * 3, profile.CompletedRuns);
        Assert.Equal(expected, profile.Milestone);
        Assert.False(profile.RewardsEnabled);
        Assert.Equal(0, profile.XpGranted);
        Assert.Equal(0, profile.ItemsGranted);
    }

    [Fact]
    public void Replays_AndInvalidLegacyRows_NeverUnlockOtherBoardsOrEconomy()
    {
        var profile = OffworldPracticeProgressRules.Build([
            new(0, 7, 8),
            new(0, 4, 6),
            new(1, 0, 6),     // invalid/no completion
            new(2, 1, 33),    // outside legal move limit
            new(-1, 9, 6),    // invalid board
            new(3, 1, 6)      // unknown board
        ]);
        Assert.Equal(1, profile.BoardsSolved);
        Assert.Equal(11, profile.CompletedRuns);
        var only = Assert.Single(profile.Boards);
        Assert.Equal(0, only.PuzzleIndex);
        Assert.Equal(6, only.BestSteps);
        Assert.False(profile.RewardsEnabled);
    }
}
