using Vuxo.Domain.Players;
using Vuxo.Domain.Inventory;

namespace Vuxo.Application.Worlds.Realtime;

public sealed class WorldSimulation(TimeProvider timeProvider)
{
    private readonly object _gate = new();
    private readonly Dictionary<string, PlayerSession> _players = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _connections = new(StringComparer.Ordinal);
    private long _tick;

    public WorldJoinResult Join(
        string connectionId,
        string playerId,
        PlayerCharacter character,
        WorldSpawnPoint spawn,
        IReadOnlyList<EquippedInventoryItem>? equipment = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionId);
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        ArgumentNullException.ThrowIfNull(character);

        if (!double.IsFinite(spawn.X) || !double.IsFinite(spawn.Y))
        {
            throw new ArgumentOutOfRangeException(nameof(spawn), "Spawn coordinates must be finite.");
        }

        var normalizedPlayerId = playerId.Trim();
        if (!string.Equals(normalizedPlayerId, character.OwnerId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Authenticated player id must match the character owner id.");
        }

        var equipped = equipment ?? [];
        if (equipped.Any(item => !string.Equals(item.PlayerId, normalizedPlayerId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException("Equipment must belong to the connected character.");
        }
        // Effective movement speed is derived exclusively from server-owned
        // character attributes and persisted, validated equipment.
        var effectiveSpeed = EquipmentRules.Evaluate(character.Attributes, equipped).MovementSpeedMultiplier;

        lock (_gate)
        {
            if (_connections.TryGetValue(connectionId, out var connectionOwner)
                && !string.Equals(connectionOwner, normalizedPlayerId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("The SignalR connection is already bound to another player.");
            }

            var isReconnect = _players.TryGetValue(normalizedPlayerId, out var session);
            string? replacedConnectionId = null;

            if (session is null)
            {
                session = new PlayerSession(
                    connectionId,
                    normalizedPlayerId,
                    character.Id,
                    character.Name,
                    character.Attributes,
                    effectiveSpeed,
                    spawn.X,
                    spawn.Y);
                _players.Add(normalizedPlayerId, session);
            }
            else
            {
                replacedConnectionId = session.ConnectionId;
                _connections.Remove(session.ConnectionId);
                session.ConnectionId = connectionId;
                session.CharacterId = character.Id;
                session.CharacterName = character.Name;
                session.BaseAttributes = character.Attributes;
                session.SpeedMultiplier = effectiveSpeed;
                session.Revision++;
                session.HorizontalIntent = 0;
                session.VerticalIntent = 0;
                session.LastAcceptedIntentAt = null;
                session.LastSequence = -1;
            }

            _connections[connectionId] = normalizedPlayerId;

            var self = SnapshotUnsafe(session);
            var players = _players.Values
                .Select(SnapshotUnsafe)
                .OrderBy(player => player.PlayerId, StringComparer.Ordinal)
                .ToArray();

            return new WorldJoinResult(self, players, isReconnect, replacedConnectionId);
        }
    }

    /// <summary>
    /// Apply a committed owner-scoped equipment loadout to an online session.
    /// The caller must retrieve equipment from the server repository after the DB
    /// commit, not from a client payload. Revision protects in-flight tick snapshots.
    /// </summary>
    public WorldPlayerSnapshot? RefreshEquipment(
        string playerId, IReadOnlyList<EquippedInventoryItem> equipment)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        ArgumentNullException.ThrowIfNull(equipment);
        var normalizedId = playerId.Trim();
        if (equipment.Any(item => !string.Equals(item.PlayerId, normalizedId, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException("Equipment must belong to the online player.");
        }

        lock (_gate)
        {
            if (!_players.TryGetValue(normalizedId, out var session)) return null;

            var speed = EquipmentRules.Evaluate(session.BaseAttributes, equipment).MovementSpeedMultiplier;
            if (speed == session.SpeedMultiplier) return null;

            session.SpeedMultiplier = speed;
            session.Revision++;
            return SnapshotUnsafe(session);
        }
    }

    public WorldPlayerSnapshot? Leave(string connectionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionId);

        lock (_gate)
        {
            if (!_connections.Remove(connectionId, out var playerId)
                || !_players.TryGetValue(playerId, out var session)
                || !string.Equals(session.ConnectionId, connectionId, StringComparison.Ordinal))
            {
                return null;
            }

            _players.Remove(playerId);
            return SnapshotUnsafe(session);
        }
    }

    public WorldIntentResult SubmitIntent(
        string connectionId,
        int horizontal,
        int vertical,
        long sequence)
    {
        if (horizontal is < -1 or > 1 || vertical is < -1 or > 1)
        {
            return WorldIntentResult.Rejected(WorldSimulationRules.InputOutOfRangeError);
        }

        lock (_gate)
        {
            if (!_connections.TryGetValue(connectionId, out var playerId)
                || !_players.TryGetValue(playerId, out var session)
                || !string.Equals(session.ConnectionId, connectionId, StringComparison.Ordinal))
            {
                return WorldIntentResult.Rejected(WorldSimulationRules.PlayerNotJoinedError);
            }

            if (sequence <= session.LastSequence)
            {
                return WorldIntentResult.Rejected(WorldSimulationRules.InputStaleError);
            }

            var now = timeProvider.GetUtcNow();
            if (session.LastAcceptedIntentAt is { } lastAccepted
                && now - lastAccepted < WorldSimulationRules.MinimumInputInterval)
            {
                return WorldIntentResult.Rejected(WorldSimulationRules.InputRateLimitedError);
            }

            session.HorizontalIntent = horizontal;
            session.VerticalIntent = vertical;
            session.LastSequence = sequence;
            session.LastAcceptedIntentAt = now;
            return WorldIntentResult.Success;
        }
    }

    public IReadOnlyList<WorldPlayerSnapshot> Snapshot()
    {
        lock (_gate)
        {
            return _players.Values
                .Select(SnapshotUnsafe)
                .OrderBy(player => player.PlayerId, StringComparer.Ordinal)
                .ToArray();
        }
    }

    public async Task<WorldSimulationDelta> TickAsync(
        TimeSpan delta,
        IWorldWalkabilityMap walkabilityMap,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(walkabilityMap);
        if (delta <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(delta), "Tick delta must be positive.");
        }

        var effectiveDelta = delta <= WorldSimulationRules.MaximumTickDelta
            ? delta
            : WorldSimulationRules.MaximumTickDelta;

        TickCandidate[] candidates;
        long tick;
        lock (_gate)
        {
            tick = ++_tick;
            candidates = _players.Values
                .Where(session => session.HorizontalIntent != 0 || session.VerticalIntent != 0)
                .Select(session => new TickCandidate(
                    session.PlayerId,
                    session.ConnectionId,
                    session.X,
                    session.Y,
                    session.HorizontalIntent,
                    session.VerticalIntent,
                    session.LastSequence,
                    session.SpeedMultiplier,
                    session.Revision))
                .ToArray();
        }

        if (candidates.Length == 0)
        {
            return new WorldSimulationDelta(tick, Array.Empty<WorldPlayerSnapshot>());
        }

        var moved = new List<WorldPlayerSnapshot>(candidates.Length);
        foreach (var candidate in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var vectorLength = Math.Sqrt(
                (candidate.Horizontal * candidate.Horizontal)
                + (candidate.Vertical * candidate.Vertical));
            if (vectorLength <= 0d)
            {
                continue;
            }

            var distance = WorldSimulationRules.BaseMovementTilesPerSecond
                * candidate.SpeedMultiplier
                * effectiveDelta.TotalSeconds;
            var targetX = candidate.X + ((candidate.Horizontal / vectorLength) * distance);
            var targetY = candidate.Y + ((candidate.Vertical / vectorLength) * distance);

            if (!await walkabilityMap.IsWalkableAsync(targetX, targetY, cancellationToken))
            {
                continue;
            }

            lock (_gate)
            {
                if (!_players.TryGetValue(candidate.PlayerId, out var current)
                    || !string.Equals(current.ConnectionId, candidate.ConnectionId, StringComparison.Ordinal)
                    || current.Revision != candidate.Revision
                    || current.LastSequence != candidate.Sequence)
                {
                    continue;
                }

                current.X = targetX;
                current.Y = targetY;
                current.Revision++;
                moved.Add(SnapshotUnsafe(current));
            }
        }

        return new WorldSimulationDelta(tick, moved);
    }

    private static WorldPlayerSnapshot SnapshotUnsafe(PlayerSession session)
        => new(
            session.PlayerId,
            session.CharacterId,
            session.CharacterName,
            session.X,
            session.Y,
            session.SpeedMultiplier,
            session.Revision);

    private sealed class PlayerSession(
        string connectionId,
        string playerId,
        Guid characterId,
        string characterName,
        PlayerAttributes baseAttributes,
        double speedMultiplier,
        double x,
        double y)
    {
        public string ConnectionId { get; set; } = connectionId;
        public string PlayerId { get; } = playerId;
        public Guid CharacterId { get; set; } = characterId;
        public string CharacterName { get; set; } = characterName;
        public PlayerAttributes BaseAttributes { get; set; } = baseAttributes;
        public double SpeedMultiplier { get; set; } = speedMultiplier;
        public double X { get; set; } = x;
        public double Y { get; set; } = y;
        public int HorizontalIntent { get; set; }
        public int VerticalIntent { get; set; }
        public long LastSequence { get; set; } = -1;
        public DateTimeOffset? LastAcceptedIntentAt { get; set; }
        public long Revision { get; set; }
    }

    private sealed record TickCandidate(
        string PlayerId,
        string ConnectionId,
        double X,
        double Y,
        int Horizontal,
        int Vertical,
        long Sequence,
        double SpeedMultiplier,
        long Revision);
}
