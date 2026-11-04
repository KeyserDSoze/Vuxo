using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Vuxo.Api.Observability;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;
using Vuxo.Domain.Inventory;

namespace Vuxo.Api.Realtime;

[Authorize]
public sealed class WorldHub(
    ILogger<WorldHub> logger,
    IPlayerCharacterRepository characters,
    IPlayerEquipmentRepository equipment,
    WorldRuntimeMap runtimeMap,
    WorldSimulation simulation,
    WorldBootstrapSpec bootstrap) : Hub
{
    public static string GetGroupName(string worldId) => $"world:{worldId.Trim()}";

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation(
            "World transport connected. ConnectionId={ConnectionId} User={User}",
            Context.ConnectionId,
            Context.UserIdentifier);
        await base.OnConnectedAsync();
    }

    public async Task<WorldJoinResult> JoinWorld()
    {
        var playerId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        using var activity = VuxoTelemetry.StartActivity("world.join", playerId);
        if (string.IsNullOrWhiteSpace(playerId))
        {
            activity?.SetStatus(System.Diagnostics.ActivityStatusCode.Error, "world_identity_required");
            throw new HubException("world_identity_required");
        }

        var character = await characters.GetByOwnerIdAsync(playerId, Context.ConnectionAborted);
        if (character is null)
        {
            activity?.SetStatus(System.Diagnostics.ActivityStatusCode.Error, "world_character_required");
            throw new HubException("world_character_required");
        }

        var equipped = await equipment.GetForPlayerAsync(playerId, Context.ConnectionAborted);
        var spawn = await runtimeMap.GetSpawnPointAsync(Context.ConnectionAborted);
        var result = simulation.Join(Context.ConnectionId, playerId, character, spawn, equipped);
        var groupName = GetGroupName(bootstrap.WorldId);
        activity?.SetTag("vuxo.world.id", bootstrap.WorldId);
        activity?.SetTag("vuxo.world.reconnect", result.IsReconnect);

        await Groups.AddToGroupAsync(Context.ConnectionId, groupName, Context.ConnectionAborted);

        if (result.ReplacedConnectionId is { } replacedConnectionId
            && !string.Equals(replacedConnectionId, Context.ConnectionId, StringComparison.Ordinal))
        {
            await Groups.RemoveFromGroupAsync(replacedConnectionId, groupName, Context.ConnectionAborted);
            await Clients.Client(replacedConnectionId).SendAsync(
                "world.sessionReplaced",
                new { playerId },
                Context.ConnectionAborted);
        }

        var eventName = result.IsReconnect ? "world.playerUpdated" : "world.playerJoined";
        await Clients.OthersInGroup(groupName).SendAsync(eventName, result.Self, Context.ConnectionAborted);

        logger.LogInformation(
            "Player joined world. PlayerId={PlayerId} CharacterId={CharacterId} ConnectionId={ConnectionId} Reconnect={Reconnect}",
            playerId,
            character.Id,
            Context.ConnectionId,
            result.IsReconnect);

        return result;
    }

    public WorldIntentResult SetMovementIntent(int horizontal, int vertical, long sequence)
    {
        var result = simulation.SubmitIntent(Context.ConnectionId, horizontal, vertical, sequence);
        if (!result.Accepted)
        {
            VuxoTelemetry.RecordRejectedWorldInput(result.ErrorCode);
            throw new HubException(result.ErrorCode ?? "world_input_rejected");
        }

        return result;
    }

    public async Task LeaveWorld()
    {
        var playerId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        using var activity = VuxoTelemetry.StartActivity("world.leave", playerId);
        var departed = simulation.Leave(Context.ConnectionId);
        var groupName = GetGroupName(bootstrap.WorldId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName, Context.ConnectionAborted);

        if (departed is not null)
        {
            await Clients.OthersInGroup(groupName).SendAsync(
                "world.playerLeft",
                departed,
                Context.ConnectionAborted);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var departed = simulation.Leave(Context.ConnectionId);
        if (departed is not null)
        {
            await Clients.Group(GetGroupName(bootstrap.WorldId)).SendAsync(
                "world.playerLeft",
                departed,
                CancellationToken.None);
        }

        logger.LogInformation(
            exception,
            "World transport disconnected. ConnectionId={ConnectionId} User={User} WasJoined={WasJoined}",
            Context.ConnectionId,
            Context.UserIdentifier,
            departed is not null);

        await base.OnDisconnectedAsync(exception);
    }
}
