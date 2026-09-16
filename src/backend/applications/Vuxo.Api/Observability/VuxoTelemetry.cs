using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Vuxo.Api.Observability;

public static class VuxoTelemetry
{
    public const string ActivitySourceName = "Vuxo.Api";
    public const string MeterName = "Vuxo.Api";

    public static readonly ActivitySource Activities = new(ActivitySourceName);
    public static readonly Meter Meter = new(MeterName);

    private static readonly Histogram<double> WorldTickDuration = Meter.CreateHistogram<double>(
        "vuxo.world.tick.duration",
        unit: "ms",
        description: "Duration of one authoritative world simulation tick.");

    private static readonly Histogram<long> WorldTickPlayersChanged = Meter.CreateHistogram<long>(
        "vuxo.world.tick.players_changed",
        unit: "{player}",
        description: "Players emitted in an authoritative world delta.");

    private static readonly Histogram<long> WorldPlayersOnline = Meter.CreateHistogram<long>(
        "vuxo.world.players.online",
        unit: "{player}",
        description: "Current online players observed after a world tick.");

    private static readonly Counter<long> WorldTickFailures = Meter.CreateCounter<long>(
        "vuxo.world.tick.failures",
        unit: "{failure}",
        description: "Authoritative world simulation tick failures.");

    private static readonly Counter<long> WorldInputRejected = Meter.CreateCounter<long>(
        "vuxo.world.input.rejected",
        unit: "{input}",
        description: "Rejected movement intents.");

    public static Activity? StartActivity(string name, string? playerId = null)
    {
        var activity = Activities.StartActivity(name, ActivityKind.Internal);
        if (activity is not null && !string.IsNullOrWhiteSpace(playerId))
        {
            activity.SetTag("vuxo.player.id", playerId);
        }

        return activity;
    }

    public static void RecordWorldTick(TimeSpan duration, int playersChanged, int playersOnline)
    {
        WorldTickDuration.Record(duration.TotalMilliseconds);
        WorldTickPlayersChanged.Record(playersChanged);
        WorldPlayersOnline.Record(playersOnline);
    }

    public static void RecordWorldTickFailure() => WorldTickFailures.Add(1);

    public static void RecordRejectedWorldInput(string? reason)
    {
        var tags = new TagList
        {
            { "reason", string.IsNullOrWhiteSpace(reason) ? "unknown" : reason }
        };
        WorldInputRejected.Add(1, tags);
    }
}
