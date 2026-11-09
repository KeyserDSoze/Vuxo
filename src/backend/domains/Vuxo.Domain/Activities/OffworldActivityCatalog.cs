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
    string Availability,
    int PracticeUnits,
    bool RewardsEnabled,
    bool ProgressionEnabled);

public static class OffworldActivityCatalog
{
    public const string Version = "offworld-activities-v1";
    public const string PracticeOnly = "local-practice";
    public const string Available = "available";
    public const string Planned = "planned";
    public const string ServerPathRulesVersion = "rune-path-practice-v1";

    private static readonly IReadOnlyList<OffworldActivityDefinition> Definitions =
        Array.AsReadOnly(new OffworldActivityDefinition[]
        {
            // These three practices are already playable at /refuge/*.
            // The catalog describes availability, not server-verified runs.
            new("rune-memory", "rune-memory-local-v1", "memory",
                PracticeOnly, Available, 4, false, false),
            new("rune-reflex", "rune-reflex-local-v1", "reflex",
                PracticeOnly, Available, 8, false, false),
            new("rune-path", ServerPathRulesVersion, "logic",
                PracticeOnly, Available, RunePathPracticeRules.PuzzleCount, false, false),
            // Discoverable only: no crafting minigame, run or reward exists.
            new("crafting", "crafting-design-v1", "crafting",
                PracticeOnly, Planned, 0, false, false)
        });

    public static IReadOnlyList<OffworldActivityDefinition> All => Definitions;

    public static OffworldActivityDefinition? Find(string? key) =>
        Definitions.FirstOrDefault(activity =>
            string.Equals(activity.Key, key, StringComparison.Ordinal));
}
