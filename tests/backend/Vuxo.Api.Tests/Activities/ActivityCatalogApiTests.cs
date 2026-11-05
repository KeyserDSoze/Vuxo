using System.Net;
using System.Text.Json;
using Vuxo.Api.Tests.Infrastructure;

namespace Vuxo.Api.Tests.Activities;

public sealed class ActivityCatalogApiTests
{
    [Fact]
    public async Task PracticeCatalog_IsPublicAndContainsOnlyNonRewardingActivities()
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/activities/catalog");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        Assert.Equal("offworld-activities-v1",
            root.GetProperty("catalogVersion").GetString());
        var activities = root.GetProperty("activities").EnumerateArray().ToArray();
        Assert.Equal(3, activities.Length);
        Assert.Equal(new[] { "rune-memory", "rune-reflex", "rune-path" },
            activities.Select(x => x.GetProperty("key").GetString()));
        Assert.All(activities, definition =>
        {
            Assert.False(definition.GetProperty("rewardsEnabled").GetBoolean());
            Assert.Equal("local-practice",
                definition.GetProperty("verification").GetString());
            Assert.False(string.IsNullOrWhiteSpace(
                definition.GetProperty("rulesVersion").GetString()));
        });
    }

    [Theory]
    [InlineData(0, 4)]
    [InlineData(1, 4)]
    [InlineData(2, 5)]
    public async Task RunePathBoard_HasCanonicalGridAndServerVersion(
        int index, int expectedWalls)
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync(
            $"/api/activities/rune-path/puzzles/{index}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        Assert.Equal(index, root.GetProperty("puzzleIndex").GetInt32());
        Assert.Equal(4, root.GetProperty("gridSize").GetInt32());
        Assert.Equal("rune-path-practice-v1",
            root.GetProperty("rulesVersion").GetString());
        Assert.Equal(expectedWalls, root.GetProperty("walls").GetArrayLength());
        Assert.Equal(0, root.GetProperty("start").GetProperty("x").GetInt32());
        Assert.Equal(3, root.GetProperty("goal").GetProperty("y").GetInt32());
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(3)]
    [InlineData(100)]
    public async Task UnknownPuzzle_ReturnsStableNotFound(int index)
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync(
            $"/api/activities/rune-path/puzzles/{index}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("activity_puzzle_not_found",
            body.RootElement.GetProperty("code").GetString());
    }
}
