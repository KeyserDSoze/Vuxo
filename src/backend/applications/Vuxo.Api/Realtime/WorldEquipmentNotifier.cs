using Microsoft.AspNetCore.SignalR;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Inventory;

namespace Vuxo.Api.Realtime;

/// <summary>
/// Reconciles a committed equipment change with the single-process authoritative
/// world and broadcasts the revised player snapshot. Never accepts client stats.
/// </summary>
public sealed class WorldEquipmentNotifier(
    IPlayerEquipmentRepository equipment,
    WorldSimulation simulation,
    WorldBootstrapSpec bootstrap,
    IHubContext<WorldHub> hub,
    ILogger<WorldEquipmentNotifier> logger)
{
    public async Task RefreshAsync(string playerId, CancellationToken cancellationToken = default)
    {
        var items = await equipment.GetForPlayerAsync(playerId, cancellationToken);
        var changed = simulation.RefreshEquipment(playerId, items);
        if (changed is null) return;

        try
        {
            await hub.Clients.Group(WorldHub.GetGroupName(bootstrap.WorldId))
                .SendAsync("world.playerUpdated", changed, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Persistence already succeeded. Do not return a spurious HTTP error
            // that would cause clients to retry an equip that was committed.
            // Future tick deltas carry the newer revision to connected clients.
            logger.LogWarning(exception,
                "Equipment synced to simulation but world broadcast failed. PlayerId={PlayerId} Revision={Revision}",
                playerId, changed.Revision);
        }
    }
}
