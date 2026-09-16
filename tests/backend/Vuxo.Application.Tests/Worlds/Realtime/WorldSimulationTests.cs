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
                "bottom-1",
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
