using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Vuxo.Domain.PersonalContent;

/// <summary>Deterministic four-rune memory game tied to a player-scoped grant.</summary>
public static class PortalSequenceRules
{
    public const string PortalKey = "challenge.sequence.v1";
    public const string Version = "portal-sequence-v1";
    public const int Length = 4;

    private static readonly string[] Runes = ["sun", "moon", "star", "wave"];

    public static IReadOnlyList<string> RuneIds => Array.AsReadOnly(Runes);

    public static PortalSequenceChallenge Generate(Guid grantId, long seed, string ruleVersion)
    {
        if (grantId == Guid.Empty) throw new ArgumentException("Grant id is required.", nameof(grantId));
        ArgumentException.ThrowIfNullOrWhiteSpace(ruleVersion);

        // Versioned, culture-independent canonical input; no GetHashCode / Random.
        var identity = string.Join(":",
            Version, grantId.ToString("N"), seed.ToString(CultureInfo.InvariantCulture), ruleVersion);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(identity));
        var sequence = new string[Length];
        for (var i = 0; i < Length; i++)
        {
            sequence[i] = Runes[hash[i] % Runes.Length];
        }

        return new PortalSequenceChallenge(Version, sequence);
    }

    public static bool IsWellFormed(IReadOnlyList<string>? answer) =>
        answer is { Count: Length } &&
        answer.All(rune => rune is not null && Runes.Contains(rune, StringComparer.Ordinal));

    public static bool Matches(PortalSequenceChallenge challenge, IReadOnlyList<string>? answer) =>
        IsWellFormed(answer) &&
        challenge.Sequence.SequenceEqual(answer!, StringComparer.Ordinal);
}

public sealed record PortalSequenceChallenge(string Version, IReadOnlyList<string> Sequence);
