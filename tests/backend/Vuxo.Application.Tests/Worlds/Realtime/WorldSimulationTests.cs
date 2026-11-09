using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;

namespace Vuxo.Application.Tests.Worlds.Realtime;

public sealed class WorldSimulationTests
{
    public static IEnumerable<object[]> DexterityCases()
    {
        for (var dexterity = 0; dexterity <= 10; dexterity++)
        {
            var expectedDistance = 0.3d * (1d + (dexterity * 0.1d));
            yield return [dexterity, expectedDistance];
        }
    }

    [Fact]
    public async Task Join_TwoPlayersExposeOnlyPersistedCosmeticsThroughMoveAndReconnect()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        var first = CreateCharacter("player-a", 4);
        var second = PlayerCharacter.Create(
            "player-b",
            "Vuxian Beta",
            PlayerAttributes.Create(0, 4, 0, 6, 0, 0),
            new CharacterAppearance(
                "hair-3", "red", "face-2", "body-3", "skin-5",
                "green", "skirt", "white", "shoe-3", "blue"));

        var a = simulation.Join("conn-a", "player-a", first, new WorldSpawnPoint(0, 0));
        var b = simulation.Join("conn-b", "player-b", second, new WorldSpawnPoint(1, 0));
        Assert.Equal(CharacterAppearanceCatalog.Version, a.Self.Appearance?.CatalogVersion);
        Assert.Equal("black", a.Self.Appearance?.HairColor);
        Assert.Equal("shorts", a.Self.Appearance?.BottomStyle);
        Assert.Equal("red", b.Self.Appearance?.HairColor);
        Assert.Equal("skin-5", b.Self.Appearance?.SkinTone);
        Assert.Equal("skirt", b.Self.Appearance?.BottomStyle);
        Assert.Equal("red", Assert.Single(b.Players, p => p.PlayerId == "player-b").Appearance?.HairColor);

        Assert.True(simulation.SubmitIntent("conn-b", 1, 0, 1).Accepted);
        var delta = await simulation.TickAsync(TimeSpan.FromMilliseconds(100), new StubWalkabilityMap(true));
        Assert.Equal(b.Self.Appearance, Assert.Single(delta.Players).Appearance);

        var reconnect = simulation.Join("conn-b2", "player-b", second, new WorldSpawnPoint(99, 99));
        Assert.Equal(b.Self.Appearance, reconnect.Self.Appearance);
        Assert.Equal(b.Self.Appearance, Assert.Single(simulation.Snapshot(), p => p.PlayerId == "player-b").Appearance);

        var json = System.Text.Json.JsonSerializer.Serialize(
            reconnect.Self,
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        Assert.Contains("\"catalogVersion\":\"0.0.1\"", json);
        Assert.Contains("\"hairColor\":\"red\"", json);
        Assert.DoesNotContain("ownerId", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("email", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accessToken", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void InvalidHistoricalCosmeticsAreNotExposedToPeers()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        var stale = PlayerCharacter.Create(
            "player-a", "Vuxian",
            PlayerAttributes.Create(0, 4, 0, 6, 0, 0),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "unknown-bottom", "black", "shoe-1", "black"));
        var result = simulation.Join("conn-a", "player-a", stale, new WorldSpawnPoint(0, 0));
        Assert.Null(result.Self.Appearance);
    }

    [Theory]
    [MemberData(nameof(DexterityCases))]
    public async Task Tick_MovementDistanceUsesDexterityMultiplier(int dexterity, double expectedDistance)
    {
        var time = new ManualTimeProvider();
        var simulation = new WorldSimulation(time);
        var character = CreateCharacter("player-a", dexterity);
        simulation.Join("connection-a", "player-a", character, new WorldSpawnPoint(0.5d, 0.5d));
        Assert.True(simulation.SubmitIntent("connection-a", 1, 0, 1).Accepted);

        var delta = await simulation.TickAsync(
            TimeSpan.FromMilliseconds(100),
            new StubWalkabilityMap(true));

        var moved = Assert.Single(delta.Players);
        Assert.Equal(0.5d + expectedDistance, moved.X, 10);
        Assert.Equal(0.5d, moved.Y, 10);
    }

    [Fact]
    public void SubmitIntent_RejectsOutOfRangeAndRateLimitedInput()
    {
        var time = new ManualTimeProvider();
        var simulation = new WorldSimulation(time);
        simulation.Join("connection-a", "player-a", CreateCharacter("player-a", 3), new WorldSpawnPoint(0.5d, 0.5d));

        var outOfRange = simulation.SubmitIntent("connection-a", 2, 0, 1);
        Assert.False(outOfRange.Accepted);
        Assert.Equal(WorldSimulationRules.InputOutOfRangeError, outOfRange.ErrorCode);

        Assert.True(simulation.SubmitIntent("connection-a", 1, 0, 1).Accepted);
        time.Advance(TimeSpan.FromMilliseconds(10));

        var rateLimited = simulation.SubmitIntent("connection-a", 0, 1, 2);
        Assert.False(rateLimited.Accepted);
        Assert.Equal(WorldSimulationRules.InputRateLimitedError, rateLimited.ErrorCode);

        time.Advance(WorldSimulationRules.MinimumInputInterval);
        Assert.True(simulation.SubmitIntent("connection-a", 0, 1, 2).Accepted);
    }

    [Fact]
    public void SubmitIntent_RejectsStaleSequence()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        simulation.Join("connection-a", "player-a", CreateCharacter("player-a", 3), new WorldSpawnPoint(0.5d, 0.5d));

        Assert.True(simulation.SubmitIntent("connection-a", 1, 0, 7).Accepted);
        var stale = simulation.SubmitIntent("connection-a", 1, 0, 7);

        Assert.False(stale.Accepted);
        Assert.Equal(WorldSimulationRules.InputStaleError, stale.ErrorCode);
    }

    [Fact]
    public async Task Tick_WhenTargetIsBlocked_DoesNotMovePlayer()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        simulation.Join("connection-a", "player-a", CreateCharacter("player-a", 5), new WorldSpawnPoint(3.5d, 4.5d));
        Assert.True(simulation.SubmitIntent("connection-a", 1, 0, 1).Accepted);

        var delta = await simulation.TickAsync(
            WorldSimulationRules.TickInterval,
            new StubWalkabilityMap(false));

        Assert.Empty(delta.Players);
        var player = Assert.Single(simulation.Snapshot());
        Assert.Equal(3.5d, player.X, 10);
        Assert.Equal(4.5d, player.Y, 10);
    }

    [Fact]
    public void Join_ReconnectReplacesConnectionWithoutDuplicatingPresence()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        var character = CreateCharacter("player-a", 4);

        var first = simulation.Join("connection-a", "player-a", character, new WorldSpawnPoint(1.5d, 2.5d));
        var reconnect = simulation.Join("connection-b", "player-a", character, new WorldSpawnPoint(99d, 99d));

        Assert.False(first.IsReconnect);
        Assert.True(reconnect.IsReconnect);
        Assert.Equal("connection-a", reconnect.ReplacedConnectionId);
        Assert.Single(reconnect.Players);
        Assert.Equal(1.5d, reconnect.Self.X, 10);
        Assert.Equal(2.5d, reconnect.Self.Y, 10);
        Assert.Null(simulation.Leave("connection-a"));
        Assert.Single(simulation.Snapshot());
        Assert.NotNull(simulation.Leave("connection-b"));
        Assert.Empty(simulation.Snapshot());
    }

    [Fact]
    public async Task Tick_DiagonalIntentIsNormalized()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        simulation.Join("connection-a", "player-a", CreateCharacter("player-a", 0), new WorldSpawnPoint(0d, 0d));
        Assert.True(simulation.SubmitIntent("connection-a", 1, 1, 1).Accepted);

        var delta = await simulation.TickAsync(
            TimeSpan.FromMilliseconds(100),
            new StubWalkabilityMap(true));

        var moved = Assert.Single(delta.Players);
        var distance = Math.Sqrt((moved.X * moved.X) + (moved.Y * moved.Y));
        Assert.Equal(0.3d, distance, 10);
    }

    private static PlayerCharacter CreateCharacter(string ownerId, int dexterity)
        => PlayerCharacter.Create(
            ownerId,
            "Vuxian",
            PlayerAttributes.Create(0, dexterity, 0, 10 - dexterity, 0, 0),
            new CharacterAppearance(
                "hair-1",
                "black",
                "face-1",
                "body-1",
                "skin-1",
                "blue",
                "shorts",
                "black",
                "shoe-1",
                "black"));

    private sealed class StubWalkabilityMap(bool walkable) : IWorldWalkabilityMap
    {
        public ValueTask<bool> IsWalkableAsync(double worldX, double worldY, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(walkable);
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private DateTimeOffset _utcNow = new(2026, 9, 16, 10, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void Advance(TimeSpan delta) => _utcNow = _utcNow.Add(delta);
    }
}
