using System.Diagnostics;
using Microsoft.AspNetCore.SignalR;
using Vuxo.Api.Observability;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;

namespace Vuxo.Api.Realtime;

public sealed class WorldSimulationTicker(
    WorldSimulation simulation,
    WorldRuntimeMap runtimeMap,
    WorldBootstrapSpec bootstrap,
    IHubContext<WorldHub> hubContext,
    TimeProvider timeProvider,
    ILogger<WorldSimulationTicker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(WorldSimulationRules.TickInterval, timeProvider, stoppingToken);
                var stopwatch = Stopwatch.StartNew();
                var delta = await simulation.TickAsync(
                    WorldSimulationRules.TickInterval,
                    runtimeMap,
                    stoppingToken);
                stopwatch.Stop();

                VuxoTelemetry.RecordWorldTick(
                    stopwatch.Elapsed,
                    delta.Players.Count,
                    simulation.Snapshot().Count);

                if (delta.Players.Count > 0)
                {
                    await hubContext.Clients
                        .Group(WorldHub.GetGroupName(bootstrap.WorldId))
                        .SendAsync("world.delta", delta, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                VuxoTelemetry.RecordWorldTickFailure();
                logger.LogError(exception, "World simulation tick failed.");
            }
        }
    }
}
