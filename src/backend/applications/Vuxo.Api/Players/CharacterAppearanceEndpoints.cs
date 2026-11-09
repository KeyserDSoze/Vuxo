using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Vuxo.Api.Contracts.Players;
using Vuxo.Api.Realtime;
using Vuxo.Application.Players;
using Vuxo.Application.Worlds;
using Vuxo.Application.Worlds.Realtime;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Players;

public sealed record UpdateCharacterAppearanceRequest(
    string CatalogVersion,
    long ExpectedRevision,
    CharacterAppearanceRequest? Appearance);

public static class CharacterAppearanceEndpoints
{
    public static IEndpointRouteBuilder MapCharacterAppearanceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/characters/me/appearance", async (
            ClaimsPrincipal user,
            IPlayerCharacterRepository characters,
            CancellationToken cancellationToken) =>
        {
            var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();

            var character = await characters.GetByOwnerIdAsync(ownerId, cancellationToken);
            if (character is null) return Results.NotFound(new { code = "character_not_found" });

            return Results.Ok(new
            {
                character.Name,
                character.Attributes,
                catalogVersion = CharacterAppearanceCatalog.Version,
                appearanceRevision = character.AppearanceRevision,
                character.Appearance
            });
        }).RequireAuthorization();

        app.MapPatch("/api/characters/me/appearance", async (
            UpdateCharacterAppearanceRequest request,
            ClaimsPrincipal user,
            CharacterAppearanceUpdateService updates,
            WorldSimulation simulation,
            WorldBootstrapSpec world,
            IHubContext<WorldHub> hubs,
            ILoggerFactory loggers,
            CancellationToken cancellationToken) =>
        {
            var ownerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(ownerId)) return Results.Unauthorized();
            if (request.Appearance is null)
                return Results.BadRequest(new { code = "character_appearance_required" });

            var requested = new CharacterAppearance(
                request.Appearance.HairStyle,
                request.Appearance.HairColor,
                request.Appearance.Face,
                request.Appearance.BodyType,
                request.Appearance.SkinTone,
                request.Appearance.TopColor,
                request.Appearance.BottomStyle,
                request.Appearance.BottomColor,
                request.Appearance.ShoeStyle,
                request.Appearance.ShoeColor);

            SavedCharacterAppearance saved;
            try
            {
                saved = await updates.UpdateAsync(ownerId, request.CatalogVersion,
                    request.ExpectedRevision, requested, cancellationToken);
            }
            catch (CharacterAppearanceUpdateException exception) when (
                exception.Code == CharacterAppearanceUpdateErrorCodes.NotFound)
            {
                return Results.NotFound(new { code = exception.Code });
            }
            catch (CharacterAppearanceUpdateException exception) when (
                exception.Code == CharacterAppearanceUpdateErrorCodes.InvalidOption)
            {
                return Results.BadRequest(new { code = exception.Code, field = exception.Field });
            }
            catch (CharacterAppearanceUpdateException exception) when (
                exception.Code == CharacterAppearanceUpdateErrorCodes.InvalidCatalog
                || exception.Code == CharacterAppearanceUpdateErrorCodes.InvalidRevision)
            {
                return Results.BadRequest(new { code = exception.Code });
            }
            catch (CharacterAppearanceUpdateException exception)
            {
                return Results.Conflict(new { code = exception.Code });
            }

            // The atomic compare-and-swap is already committed when we notify
            // SignalR; no client-requested coordinates or cosmetic claims enter
            // the world. If a peer is offline, JoinWorld reads persisted state.
            if (saved.Changed)
            {
                var snapshot = simulation.ApplySavedAppearance(
                    ownerId, saved.CharacterId, saved.Appearance, saved.Revision);
                if (snapshot is not null)
                {
                    try
                    {
                        await hubs.Clients.Group(WorldHub.GetGroupName(world.WorldId))
                            .SendAsync("world.playerUpdated", snapshot, cancellationToken);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        // A transport failure must not pretend to roll back a
                        // successfully committed database update.
                        loggers.CreateLogger("CharacterAppearanceEndpoints")
                            .LogError(exception, "Committed appearance update could not be broadcast.");
                    }
                }
            }

            return Results.Ok(new
            {
                catalogVersion = CharacterAppearanceCatalog.Version,
                appearanceRevision = saved.Revision,
                saved.Appearance,
                saved.Changed
            });
        }).RequireAuthorization();

        return app;
    }
}
