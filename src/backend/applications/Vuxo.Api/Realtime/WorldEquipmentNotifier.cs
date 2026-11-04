using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Inventory;

namespace Vuxo.Api.Realtime;

/// <summary>
/// Reconciles committed equipment with the world-authoritative simulation.
/// Serialized database reads avoid stale out-of-order equip/unequip refreshes
/// in the single-process 0.0.1 world. Never accepts client-provided stats.
/// </summary>
public sealed class WorldEquipmentNotifier(
    IServiceScopeFactory scopeFactory,
    WorldSimulation simulation,
    WorldBootstrapSpec bootstrap,
    IHubContext<WorldHub> hub,
    ILogger<WorldEquipmentNotifier> logger)
{
    private readonly SemaphoreSlim _refreshGate = new(1, 1);

    public async Task RefreshAsync(string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        await _refreshGate.WaitAsync(cancellationToken);
        try
        {
            // Resolve a fresh DbContext after the committing request; reading the
            // originating scoped context can produce a stale tracked loadout.
            await using var scope = scopeFactory.CreateAsyncScope();
            var repository = scope.ServiceProvider.GetRequiredService<IPlayerEquipmentRepository>();
            var items = await repository.GetForPlayerAsync(playerId, cancellationToken);
            var changed = simulation.RefreshEquipment(playerId, items);
            if (changed is null) return;

            try
            {
                await hub.Clients.Group(WorldHub.GetGroupName(bootstrap.WorldId))
                    .SendAsync("world.playerUpdated", changed, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // Persistence already succeeded. Avoid a spurious HTTP error that
                // would provoke retries of a committed equip. Subsequent movement
                // deltas/reconnect carry the new revision to connected clients.
                logger.LogWarning(exception,
                    "Equipment synced but live broadcast failed. PlayerId={PlayerId} Revision={Revision}",
                    playerId, changed.Revision);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The equipment mutation was already committed before this notifier
            // runs. A read/projection failure must not make the API pretend it
            // rolled back; reconciliation is retried on the next join/reconnect.
            logger.LogError(exception,
                "Equipment committed but realtime reconciliation failed. PlayerId={PlayerId}",
                playerId);
        }
        finally
        {
            _refreshGate.Release();
        }
    }
}
