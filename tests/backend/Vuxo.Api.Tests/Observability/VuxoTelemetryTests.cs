using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Vuxo.Api.Observability;

namespace Vuxo.Api.Tests.Observability;

public sealed class VuxoTelemetryTests
{
    [Fact]
    public void ActivitySource_AddsPlayerTag()
    {
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == VuxoTelemetry.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded
        };
        ActivitySource.AddActivityListener(listener);

        using var activity = VuxoTelemetry.StartActivity("world.join", "player-a");

        Assert.NotNull(activity);
        Assert.Equal("world.join", activity.OperationName);
        Assert.Equal("player-a", activity.GetTagItem("vuxo.player.id"));
    }

    [Fact]
    public void Meter_EmitsWorldHostMeasurements()
    {
        var doubleMeasurements = new ConcurrentQueue<(string Name, double Value)>();
        var longMeasurements = new ConcurrentQueue<(string Name, long Value)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == VuxoTelemetry.MeterName)
            {
                meterListener.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<double>((instrument, measurement, _, _) =>
            doubleMeasurements.Enqueue((instrument.Name, measurement)));
        listener.SetMeasurementEventCallback<long>((instrument, measurement, _, _) =>
            longMeasurements.Enqueue((instrument.Name, measurement)));
        listener.Start();

        VuxoTelemetry.RecordWorldTick(TimeSpan.FromMilliseconds(12.5), 3, 7);
        VuxoTelemetry.RecordRejectedWorldInput("world_input_rate_limited");
        VuxoTelemetry.RecordWorldTickFailure();

        Assert.Contains(doubleMeasurements, item =>
            item.Name == "vuxo.world.tick.duration" && Math.Abs(item.Value - 12.5) < 0.01);
        Assert.Contains(longMeasurements, item => item.Name == "vuxo.world.tick.players_changed" && item.Value == 3);
        Assert.Contains(longMeasurements, item => item.Name == "vuxo.world.players.online" && item.Value == 7);
        Assert.Contains(longMeasurements, item => item.Name == "vuxo.world.input.rejected" && item.Value == 1);
        Assert.Contains(longMeasurements, item => item.Name == "vuxo.world.tick.failures" && item.Value == 1);
    }
}
