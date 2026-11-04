namespace Vuxo.Domain.Inventory;

/// <summary>
/// Server-owned canonical, versioned inventory reward catalog. Unrecognized
/// historical reward keys are NOT converted into arbitrary items.
/// </summary>
public static class InventoryItemCatalog
{
    public const string RuneShard = "item.rune_shard.v1";
    public const string GroveSeed = "item.grove_seed.v1";
    public const string TidalPearl = "item.tidal_pearl.v1";

    public static IReadOnlyList<string> ItemKeys { get; } = Array.AsReadOnly(
        new[] { RuneShard, GroveSeed, TidalPearl });

    public static bool IsSupported(string? rewardKey) =>
        rewardKey is RuneShard or GroveSeed or TidalPearl;
}
