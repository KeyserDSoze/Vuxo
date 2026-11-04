using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;
using Vuxo.Domain.Inventory;

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

    [Fact]
    public async Task Tick_UsesCommittedSwiftFeatherDexterity_AndRevertsOnUnequip()
    {
        var simulation = new WorldSimulation(new ManualTimeProvider());
        var character = CreateCharacter("player-a", 2);
        var noEquipment = simulation.Join("socket-a", "player-a", character,
            new WorldSpawnPoint(0.5, 0.5));
        Assert.Equal(1.2d, noEquipment.Self.SpeedMultiplier, 8);

        var feather = SwiftFeather("player-a");
        var changed = simulation.RefreshEquipment("player-a", [feather]);
        Assert.NotNull(changed);
        Assert.Equal(1.3d, changed.SpeedMultiplier, 8);
        Assert.True(changed.Revision > noEquipment.Self.Revision);
        Assert.Null(simulation.RefreshEquipment("player-a", [feather]));

        Assert.True(simulation.SubmitIntent("socket-a", 1, 0, 1).Accepted);
        var moved = await simulation.TickAsync(
            TimeSpan.FromMilliseconds(100), new StubWalkabilityMap(true));
        Assert.Equal(0.89d, Assert.Single(moved.Players).X, 8);

        var restored = simulation.RefreshEquipment("player-a", []);
        Assert.NotNull(restored);
        Assert.Equal(1.2d, restored.SpeedMultiplier, 8);
        Assert.True(restored.Revision > changed.Revision);
        var next = await simulation.TickAsync(
            TimeSpan.FromMilliseconds(100), new StubWalkabilityMap(true));
        Assert.Equal(1.25d, Assert.Single(next.Players).X, 8);
    }

    [Fact]
    public void Join_ReconnectReloadsServerLoadoutAndRejectsOldConnection()
    {
        var sim = new WorldSimulation(new ManualTimeProvider());
        var character = CreateCharacter("player-a", 2);
        var feather = SwiftFeather("player-a");
        var first = sim.Join("old-connection", "player-a", character,
            new WorldSpawnPoint(4.5, 4.5), [feather]);
        Assert.Equal(1.3d, first.Self.SpeedMultiplier, 8);

        var reconnect = sim.Join("new-connection", "player-a", character,
            new WorldSpawnPoint(99.5, 99.5), []);
        Assert.True(reconnect.IsReconnect);
        Assert.Equal("old-connection", reconnect.ReplacedConnectionId);
        Assert.Equal(1.2d, reconnect.Self.SpeedMultiplier, 8);
        Assert.Equal(4.5d, reconnect.Self.X, 8);
        Assert.True(reconnect.Self.Revision > first.Self.Revision);
        Assert.Null(sim.Leave("old-connection"));
        Assert.False(sim.SubmitIntent("old-connection", 1, 0, 1).Accepted);
        Assert.True(sim.SubmitIntent("new-connection", 1, 0, 1).Accepted);

        Assert.Null(sim.RefreshEquipment("offline-player", [SwiftFeather("offline-player")]));
        Assert.Throws<InvalidOperationException>(() =>
            sim.RefreshEquipment("player-a", [SwiftFeather("player-b")]));
    }

    [Fact]
    public async Task EquipmentChangeInvalidatesInFlightOldSpeedTick()
    {
        var sim = new WorldSimulation(new ManualTimeProvider());
        sim.Join("socket-a", "player-a", CreateCharacter("player-a", 2),
            new WorldSpawnPoint(0.5, 0.5));
        Assert.True(sim.SubmitIntent("socket-a", 1, 0, 1).Accepted);
        var map = new PausedWalkabilityMap();
        var oldTick = sim.TickAsync(TimeSpan.FromMilliseconds(100), map);
        await map.Entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        sim.RefreshEquipment("player-a", [SwiftFeather("player-a")]);
        map.Release.TrySetResult(true);

        Assert.Empty((await oldTick).Players);
        var fresh = await sim.TickAsync(
            TimeSpan.FromMilliseconds(100), new StubWalkabilityMap(true));
        Assert.Equal(0.89d, Assert.Single(fresh.Players).X, 8);
    }

    private static EquippedInventoryItem SwiftFeather(string playerId)
        => new(playerId, EquipmentRules.Charm, Guid.NewGuid(),
            InventoryItemCatalog.SwiftFeather, Guid.NewGuid(),
            Guid.NewGuid(), DateTimeOffset.UtcNow);

    private sealed class PausedWalkabilityMap : IWorldWalkabilityMap
    {
        public TaskCompletionSource<bool> Entered { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<bool> Release { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async ValueTask<bool> IsWalkableAsync(double x, double y,
            CancellationToken cancellationToken = default)
        {
            Entered.TrySetResult(true);
            return await Release.Task.WaitAsync(cancellationToken);
        }
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
