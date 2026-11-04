using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.PersonalContent;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Personal portal projection and entry gate. The client never supplies player
/// position or portal position: both are read from authoritative server state.
/// </summary>
public sealed class WorldPortalService(
    ExclusiveContentService personalContent,
    IExclusiveContentGrantRepository grants,
    WorldSimulation simulation,
    IWorldPortalMap worldMap,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<WorldPortalMarker>> ListAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (!IsJoined(playerId)) return [];

        var active = await personalContent.GetAvailableAsync(playerId, cancellationToken);
        var portals = active.Where(x => x.PortalKey == PortalSequenceRules.PortalKey).ToArray();
        if (portals.Length == 0) return [];

        var candidates = await ReachableLocationsAsync(cancellationToken);
        return portals.Select(grant => ToMarker(grant, candidates)).ToArray();
    }

    public async Task<WorldPortalMarker> EnterAsync(
        string playerId, Guid grantId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        var grant = await grants.GetByIdForPlayerAsync(grantId, playerId.Trim(), cancellationToken)
            ?? throw new ExclusiveContentException(ExclusiveContentErrorCodes.NotFound);
        var now = timeProvider.GetUtcNow();
        if (grant.IsConsumed) throw new ExclusiveContentException(ExclusiveContentErrorCodes.Consumed);
        if (grant.IsExpired(now)) throw new ExclusiveContentException(ExclusiveContentErrorCodes.Expired);
        if (grant.PortalKey != PortalSequenceRules.PortalKey)
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.ChallengeNotAvailable);

        var player = simulation.Snapshot().FirstOrDefault(x =>
            string.Equals(x.PlayerId, playerId.Trim(), StringComparison.Ordinal));
        if (player is null)
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.WorldPortalNotJoined);

        var candidates = await ReachableLocationsAsync(cancellationToken);
        var marker = ToMarker(grant, candidates);
        if (!WorldPortalPlacementRules.CanEnter(
                new PortalWorldPoint(player.X, player.Y),
                new PortalWorldPoint(marker.X, marker.Y)))
            throw new ExclusiveContentException(ExclusiveContentErrorCodes.WorldPortalTooFar);

        return marker;
    }

    private bool IsJoined(string playerId) => simulation.Snapshot()
        .Any(x => string.Equals(x.PlayerId, playerId.Trim(), StringComparison.Ordinal));

    private static WorldPortalMarker ToMarker(
        ExclusiveContentGrant grant, IReadOnlyList<PortalWorldPoint> candidates)
    {
        var point = WorldPortalPlacementRules.Choose(grant.Id, grant.Seed, candidates);
        return new WorldPortalMarker(grant.Id, grant.ContentKey, point.X, point.Y);
    }

    /// <summary>
    /// Breadth-first walkable search around the authoritative spawn. Candidates
    /// are actually connected to spawn, not arbitrary walkable points across walls.
    /// The ordering is stable for a fixed world-generator version.
    /// </summary>
    private async Task<IReadOnlyList<PortalWorldPoint>> ReachableLocationsAsync(
        CancellationToken cancellationToken)
    {
        var spawn = await worldMap.GetSpawnPointAsync(cancellationToken);
        var startX = (int)Math.Floor(spawn.X);
        var startY = (int)Math.Floor(spawn.Y);
        var visited = new HashSet<(int X, int Y)> { (startX, startY) };
        var queue = new Queue<(int X, int Y, int Steps)>();
        queue.Enqueue((startX, startY, 0));
        var locations = new List<PortalWorldPoint>();
        var adjacent = new List<PortalWorldPoint>();
        var directions = new (int X, int Y)[] { (0, -1), (1, 0), (0, 1), (-1, 0) };

        while (queue.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var current = queue.Dequeue();
            if (current.Steps > 0)
            {
                var candidate = new PortalWorldPoint(current.X + 0.5d, current.Y + 0.5d);
                if (current.Steps >= 2) locations.Add(candidate);
                else adjacent.Add(candidate);
            }

            if (current.Steps >= WorldPortalPlacementRules.SearchRadiusTiles) continue;
            foreach (var direction in directions)
            {
                var x = current.X + direction.X;
                var y = current.Y + direction.Y;
                if (!visited.Add((x, y))) continue;
                if (!await worldMap.IsWalkableAsync(x + 0.5d, y + 0.5d, cancellationToken))
                    continue;
                queue.Enqueue((x, y, current.Steps + 1));
            }
        }

        if (locations.Count > 0) return locations;
        if (adjacent.Count > 0) return adjacent;
        return [new PortalWorldPoint(spawn.X, spawn.Y)];
    }
}

public sealed record WorldPortalMarker(Guid Id, string ContentKey, double X, double Y);
