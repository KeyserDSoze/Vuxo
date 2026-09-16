namespace Vuxo.Application.Worlds.Realtime;

public static class WorldSimulationRules
{
    public const double BaseMovementTilesPerSecond = 3d;
    public static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(50);
    public static readonly TimeSpan MaximumTickDelta = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan MinimumInputInterval = TimeSpan.FromMilliseconds(40);

    public const string PlayerNotJoinedError = "world_player_not_joined";
    public const string InputOutOfRangeError = "world_input_out_of_range";
    public const string InputStaleError = "world_input_stale";
    public const string InputRateLimitedError = "world_input_rate_limited";
}
