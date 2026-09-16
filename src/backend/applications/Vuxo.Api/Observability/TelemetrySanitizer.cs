using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;

namespace Vuxo.Api.Observability;

public static class TelemetrySanitizer
{
    public const string Redacted = "[REDACTED]";

    private static readonly string[] SensitiveFragments =
    [
        "access_token",
        "authorization",
        "password",
        "passwd",
        "secret",
        "api_key",
        "apikey",
        "bearer",
        "jwt"
    ];

    public static string SanitizeQuery(string? rawQuery)
    {
        if (string.IsNullOrWhiteSpace(rawQuery) || rawQuery == "?")
        {
            return string.Empty;
        }

        var parsed = QueryHelpers.ParseQuery(rawQuery);
        var values = new List<KeyValuePair<string, string?>>();
        foreach (var pair in parsed)
        {
            var sensitive = IsSensitiveName(pair.Key);
            foreach (var value in pair.Value)
            {
                values.Add(new KeyValuePair<string, string?>(pair.Key, sensitive ? Redacted : value));
            }
        }

        return QueryString.Create(values).Value ?? string.Empty;
    }

    public static string? NormalizeCorrelationId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > 128)
        {
            return null;
        }

        return trimmed.All(character => char.IsLetterOrDigit(character) || character is '-' or '_' or '.')
            ? trimmed
            : null;
    }

    public static bool IsSensitiveName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var normalized = name.Trim().ToLowerInvariant();
        return SensitiveFragments.Any(fragment => normalized.Contains(fragment, StringComparison.Ordinal));
    }
}
