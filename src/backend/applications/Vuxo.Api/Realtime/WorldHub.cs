using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Vuxo.Api.Realtime;

[Authorize]
public sealed class WorldHub(ILogger<WorldHub> logger) : Hub
{
    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Player connection established. ConnectionId={ConnectionId} User={User}", Context.ConnectionId, Context.UserIdentifier);
        await Clients.Others.SendAsync("player.connected", new { connectionId = Context.ConnectionId, playerId = Context.UserIdentifier });
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        logger.LogInformation(exception, "Player connection closed. ConnectionId={ConnectionId} User={User}", Context.ConnectionId, Context.UserIdentifier);
        await Clients.Others.SendAsync("player.disconnected", new { connectionId = Context.ConnectionId, playerId = Context.UserIdentifier });
        await base.OnDisconnectedAsync(exception);
    }
}
