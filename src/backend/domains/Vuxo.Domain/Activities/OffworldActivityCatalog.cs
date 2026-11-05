namespace Vuxo.Domain.Activities;

/// <summary>
/// An immutable, versioned description of an off-world activity.
/// Practice activities explicitly grant no rewards. A client-visible catalog
/// MUST NOT be interpreted as permission to award items, health or XP.
/// </summary>
public sealed record OffworldActivityDefinition(
    string Key,
    string RulesVersion,
    string Kind,
    string Verification,
    int RoundCount,
    bool RewardsEnabled);

public static class OffworldActivityCatalog
{
    public const string Version = "offworld-activities-v1";
    public const string PracticeOnly = "local-practice";
    public const string ServerPathRulesVersion = "rune-path-practice-v1";

    private static readonly IReadOnlyList<OffworldActivityDefinition> Definitions =
        Array.AsReadOnly(new OffworldActivityDefinition[]
        {
            new("rune-memory", "rune-memory-local-v1", "memory",
                PracticeOnly, 4, false),
            new("rune-reflex", "rune-reflex-local-v1", "reflex",
                PracticeOnly, 8, false),
            new("rune-path", ServerPathRulesVersion, "logic",
                PracticeOnly, RunePathPracticeRules.PuzzleCount, false)
        });

    public static IReadOnlyList<OffworldActivityDefinition> All => Definitions;

    public static OffworldActivityDefinition? Find(string? key) =>
        Definitions.FirstOrDefault(activity =>
            string.Equals(activity.Key, key, StringComparison.Ordinal));
}
