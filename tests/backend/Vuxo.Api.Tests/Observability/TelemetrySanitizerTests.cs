using Vuxo.Api.Observability;

namespace Vuxo.Api.Tests.Observability;

public sealed class TelemetrySanitizerTests
{
    [Theory]
    [InlineData("access_token")]
    [InlineData("Authorization")]
    [InlineData("password")]
    [InlineData("client_secret")]
    [InlineData("api_key")]
    [InlineData("jwt")]
    public void SensitiveNames_AreDetected(string name)
    {
        Assert.True(TelemetrySanitizer.IsSensitiveName(name));
    }

    [Fact]
    public void QuerySanitizer_RedactsSecretsAndPreservesSafeValues()
    {
        var sanitized = TelemetrySanitizer.SanitizeQuery(
            "?playerId=player-a&access_token=super-secret&mode=world&client_secret=hidden");

        Assert.Contains("playerId=player-a", sanitized, StringComparison.Ordinal);
        Assert.Contains("mode=world", sanitized, StringComparison.Ordinal);
        Assert.Contains("access_token=%5BREDACTED%5D", sanitized, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("client_secret=%5BREDACTED%5D", sanitized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("super-secret", sanitized, StringComparison.Ordinal);
        Assert.DoesNotContain("hidden", sanitized, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("corr-123", "corr-123")]
    [InlineData("  abc.def_42  ", "abc.def_42")]
    [InlineData("contains spaces", null)]
    [InlineData("<script>", null)]
    public void CorrelationId_IsNormalizedAndRejectsUnsafeValues(string raw, string? expected)
    {
        Assert.Equal(expected, TelemetrySanitizer.NormalizeCorrelationId(raw));
    }
}
