using System.Globalization;
using System.Text;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Immutable seek position in the server's (OccurredAtUtc DESC, EventId DESC)
/// order. Cursor is an opaque paging hint, NOT an authorization token:
/// every read must still be constrained by the authenticated player.
/// </summary>
public readonly record struct PortalHistoryPosition(
    DateTimeOffset OccurredAtUtc, Guid EventId);

/// <summary>
/// Versioned bounded base64url cursor shared by both portal history APIs.
/// A corrupt or unsupported cursor fails closed before querying PostgreSQL.
/// </summary>
public static class PortalHistoryCursor
{
    public static string Encode(PortalHistoryPosition position)
    {
        var payload = $"v1|{position.OccurredAtUtc.ToUniversalTime():O}|{position.EventId:D}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(payload))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static bool TryDecode(string? value, out PortalHistoryPosition? position)
    {
        position = null;
        if (value is null) return true;
        if (value.Length is < 40 or > 128 ||
            value.Any(character => !char.IsAsciiLetterOrDigit(character) &&
                character is not '-' and not '_'))
            return false;

        try
        {
            var normalized = value.Replace('-', '+').Replace('_', '/');
            var padding = (4 - normalized.Length % 4) % 4;
            var payload = new UTF8Encoding(false, true)
                .GetString(Convert.FromBase64String(normalized.PadRight(
                    normalized.Length + padding, '=')));
            var parts = payload.Split('|');
            if (parts.Length != 3 || parts[0] != "v1" ||
                !DateTimeOffset.TryParseExact(parts[1], "O",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var when) ||
                when.Offset != TimeSpan.Zero ||
                !Guid.TryParseExact(parts[2], "D", out var id) ||
                id == Guid.Empty)
                return false;

            var parsed = new PortalHistoryPosition(when, id);
            if (Encode(parsed) != value) return false;
            position = parsed;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }
}
