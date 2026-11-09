using System.Text;
using Vuxo.Application.PersonalContent;

namespace Vuxo.Api.Tests.PersonalContent;

public sealed class PortalHistoryCursorTests
{
    [Fact]
    public void RoundTrip_PreservesUtcTimestampAndGuid()
    {
        var timestamp = new DateTimeOffset(2026, 11, 9, 7, 25, 30, TimeSpan.Zero)
            .AddTicks(1234560);
        var id = Guid.Parse("bca5b69b-627a-4700-8b23-80239caabaf1");
        var token = PortalHistoryCursor.Encode(new PortalHistoryPosition(timestamp, id));

        Assert.True(PortalHistoryCursor.TryDecode(token, out var parsed));
        Assert.Equal(timestamp, parsed!.Value.OccurredAtUtc);
        Assert.Equal(id, parsed.Value.EventId);
        Assert.DoesNotContain("=", token);
        Assert.DoesNotContain("+", token);
        Assert.DoesNotContain("/", token);
    }

    [Theory]
    [InlineData("")]
    [InlineData("malformed")]
    [InlineData("e30")]
    [InlineData("v1|notencoded")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    public void InvalidTokens_AreRejected(string token)
    {
        Assert.False(PortalHistoryCursor.TryDecode(token, out var position));
        Assert.Null(position);
    }

    [Fact]
    public void UnsupportedVersionAndEmptyEventId_AreRejected()
    {
        foreach (var payload in new[]
        {
            "v2|2026-11-09T07:25:30.0000000+00:00|bca5b69b-627a-4700-8b23-80239caabaf1",
            "v1|2026-11-09T07:25:30.0000000+00:00|00000000-0000-0000-0000-000000000000",
        })
        {
            var token = Convert.ToBase64String(Encoding.UTF8.GetBytes(payload))
                .TrimEnd('=').Replace('+', '-').Replace('/', '_');
            Assert.False(PortalHistoryCursor.TryDecode(token, out _));
        }
    }

    [Fact]
    public void OmittedCursor_IsAllowedForLegacyFirstPage()
    {
        Assert.True(PortalHistoryCursor.TryDecode(null, out var position));
        Assert.Null(position);
    }
}
