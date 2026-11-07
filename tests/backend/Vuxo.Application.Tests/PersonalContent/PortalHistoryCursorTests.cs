using Vuxo.Application.PersonalContent;
using Xunit;

namespace Vuxo.Application.Tests.PersonalContent;

public sealed class PortalHistoryCursorTests
{
    private static readonly Guid PublicId = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly DateTimeOffset Instant = new(
        2026, 11, 7, 18, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Cursor_RoundTripsPreciseUtcTimestampAndPublicIdentity()
    {
        var precise = Instant.AddTicks(7);
        var encoded = PortalHistoryCursor.Encode(precise, PublicId);
        Assert.Equal(32, encoded.Length);
        Assert.Matches("^[A-Za-z0-9_-]{32}$", encoded);
        Assert.True(PortalHistoryCursor.TryDecode(encoded, out var position));
        Assert.Equal(precise, position.OccurredAtUtc);
        Assert.Equal(PublicId, position.PublicId);
        Assert.Equal(encoded, PortalHistoryCursor.Encode(position.OccurredAtUtc, position.PublicId));
    }

    [Fact]
    public void Cursor_UsesTheSameBookmarkForEquivalentOffsetInstants()
    {
        var localTime = Instant.ToOffset(TimeSpan.FromHours(2));
        Assert.Equal(PortalHistoryCursor.Encode(Instant, PublicId),
            PortalHistoryCursor.Encode(localTime, PublicId));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-cursor")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/")]
    public void Cursor_RejectsMissingMalformedAndNonCanonicalBookmarks(string? raw)
    {
        Assert.False(PortalHistoryCursor.TryDecode(raw, out _));
    }

    [Fact]
    public void Cursor_RejectsMissingPublicIdentityAndPreservesOneHundredNanoseconds()
    {
        Assert.Throws<ArgumentException>(() => PortalHistoryCursor.Encode(Instant, Guid.Empty));
        var previous = PortalHistoryCursor.Encode(Instant, PublicId);
        var next = PortalHistoryCursor.Encode(Instant.AddTicks(1), PublicId);
        Assert.NotEqual(previous, next);
        Assert.Equal(1, (PortalHistoryCursor.Decode(next).OccurredAtUtc -
            PortalHistoryCursor.Decode(previous).OccurredAtUtc).Ticks);
    }
}
