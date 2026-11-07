using System.Buffers.Binary;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Stateless continuation for a descending (occurredAtUtc, publicId) timeline.
/// Both fields are already public to the authenticated owner on the response;
/// this is a bookmark, NEVER an authentication or authorization credential.
/// The reader still filters by the authenticated JWT owner.
/// </summary>
public readonly record struct PortalHistoryPosition(DateTimeOffset OccurredAtUtc, Guid PublicId);

public static class PortalHistoryCursor
{
    private const int CursorBytes = 24; // eight UTC ticks + sixteen UUID bytes
    private const int EncodedLength = 32;

    public static string Encode(DateTimeOffset occurredAtUtc, Guid publicId)
    {
        if (publicId == Guid.Empty) throw new ArgumentException("Missing public row id.", nameof(publicId));
        Span<byte> bytes = stackalloc byte[CursorBytes];
        BinaryPrimitives.WriteInt64BigEndian(bytes, occurredAtUtc.UtcDateTime.Ticks);
        if (!publicId.TryWriteBytes(bytes[8..])) throw new InvalidOperationException("Cannot write history cursor.");
        return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public static bool TryDecode(string? cursor, out PortalHistoryPosition position)
    {
        position = default;
        if (cursor is null || cursor.Length != EncodedLength ||
            cursor.Any(ch => !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
                                (ch >= '0' && ch <= '9') || ch is '-' or '_')))
            return false;
        try
        {
            var bytes = Convert.FromBase64String(cursor.Replace('-', '+').Replace('_', '/'));
            if (bytes.Length != CursorBytes) return false;
            var ticks = BinaryPrimitives.ReadInt64BigEndian(bytes.AsSpan(0, 8));
            var publicId = new Guid(bytes.AsSpan(8, 16));
            if (publicId == Guid.Empty) return false;
            position = new PortalHistoryPosition(new DateTimeOffset(ticks, TimeSpan.Zero), publicId);
            // Refuse non-canonical base64 representations; makes token round-trips stable.
            return Encode(position.OccurredAtUtc, position.PublicId) == cursor;
        }
        catch (FormatException) { return false; }
        catch (ArgumentOutOfRangeException) { return false; }
    }

    public static PortalHistoryPosition Decode(string cursor) => TryDecode(cursor, out var position)
        ? position : throw new ArgumentException("Invalid history cursor.", nameof(cursor));
}
