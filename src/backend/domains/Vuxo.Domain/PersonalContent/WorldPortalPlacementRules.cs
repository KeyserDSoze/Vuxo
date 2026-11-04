using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Vuxo.Domain.PersonalContent;

/// <summary>
/// Stable placement and interaction radius for personal portals. Only the server
/// provides the set of walkable, spawn-reachable candidates.
/// </summary>
public static class WorldPortalPlacementRules
{
    public const string Version = "world-personal-portal-v1";
    public const double InteractionRadiusTiles = 1.5d;
    public const int SearchRadiusTiles = 5;

    public static PortalWorldPoint Choose(
        Guid grantId,
        long seed,
        IReadOnlyList<PortalWorldPoint> reachable)
    {
        if (grantId == Guid.Empty) throw new ArgumentException("Grant id required.", nameof(grantId));
        ArgumentNullException.ThrowIfNull(reachable);
        if (reachable.Count == 0) throw new ArgumentException("At least one walkable tile is required.", nameof(reachable));

        var input = string.Join(":", Version, grantId.ToString("N"),
            seed.ToString(CultureInfo.InvariantCulture));
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        var slot = BinaryPrimitives.ReadUInt32LittleEndian(hash.AsSpan(0, 4)) % (uint)reachable.Count;
        return reachable[(int)slot];
    }

    public static bool CanEnter(PortalWorldPoint player, PortalWorldPoint portal)
    {
        if (!double.IsFinite(player.X) || !double.IsFinite(player.Y)
            || !double.IsFinite(portal.X) || !double.IsFinite(portal.Y)) return false;

        var dx = player.X - portal.X;
        var dy = player.Y - portal.Y;
        return dx * dx + dy * dy <= InteractionRadiusTiles * InteractionRadiusTiles;
    }
}

public readonly record struct PortalWorldPoint(double X, double Y);
