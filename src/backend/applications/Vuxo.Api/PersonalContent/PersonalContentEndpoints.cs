using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Vuxo.Application.PersonalContent;
using Vuxo.Application.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Inventory;

namespace Vuxo.Api.PersonalContent;

public static class PersonalContentEndpoints
{
    public static IEndpointRouteBuilder MapPersonalContentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(
            "/api/inventory",
            async (ClaimsPrincipal user, ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                var awards = await service.GetInventoryAsync(playerId, cancellationToken);
                return Results.Ok(awards.Select(award => new
                {
                    award.GrantId,
                    award.ItemKey,
                    quantity = PlayerInventoryAward.Quantity,
                    award.AwardedAtUtc
                }));
            })
            .RequireAuthorization();

        endpoints.MapGet(
            "/api/inventory/stacks",
            async (ClaimsPrincipal user, PlayerEquipmentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                return Results.Ok(await service.GetStacksAsync(playerId, cancellationToken));
            })
            .RequireAuthorization();

        endpoints.MapGet(
            "/api/equipment",
            async (ClaimsPrincipal user, PlayerEquipmentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                return Results.Ok(ToEquipmentResponse(await service.GetEquipmentAsync(
                    playerId, cancellationToken)));
            })
            .RequireAuthorization();

        endpoints.MapPost(
            "/api/equipment/{grantId:guid}/equip",
            async (Guid grantId, ClaimsPrincipal user, PlayerEquipmentService service,
                CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                try
                {
                    var result = await service.EquipAsync(playerId, grantId, cancellationToken);
                    return Results.Ok(ToEquipmentResponse(result));
                }
                catch (EquipmentException ex) when (ex.Code == EquipmentErrorCodes.NotOwned)
                {
                    return Results.NotFound(new { code = ex.Code });
                }
                catch (EquipmentException ex) when (ex.Code == EquipmentErrorCodes.NotEquippable
                    || ex.Code == EquipmentErrorCodes.InvalidSlot)
                {
                    return Results.BadRequest(new { code = ex.Code });
                }
                catch (EquipmentException ex)
                {
                    return Results.Conflict(new { code = ex.Code });
                }
                catch (DbUpdateException)
                {
                    return Results.Conflict(new { code = "equipment_conflict" });
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Results.Conflict(new { code = "equipment_conflict" });
                }
            })
            .RequireAuthorization()
            .RequireRateLimiting("portal-challenge");

        endpoints.MapDelete(
            "/api/equipment/{slot}",
            async (string slot, ClaimsPrincipal user, PlayerEquipmentService service,
                CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                try
                {
                    var result = await service.UnequipAsync(playerId, slot, cancellationToken);
                    return Results.Ok(ToEquipmentResponse(result));
                }
                catch (EquipmentException ex) when (ex.Code == EquipmentErrorCodes.InvalidSlot)
                {
                    return Results.BadRequest(new { code = ex.Code });
                }
                catch (EquipmentException ex)
                {
                    return Results.Conflict(new { code = ex.Code });
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Results.Conflict(new { code = "equipment_conflict" });
                }
            })
            .RequireAuthorization()
            .RequireRateLimiting("portal-challenge");

        endpoints.MapGet(
            "/api/personal-content",
            async (ClaimsPrincipal user, ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                var grants = await service.GetAvailableAsync(playerId, cancellationToken);
                return Results.Ok(grants.Select(ToPlayerResponse));
            })
            .RequireAuthorization();

        endpoints.MapGet(
            "/api/personal-content/world-portals",
            async (ClaimsPrincipal user, WorldPortalService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                var markers = await service.ListAsync(playerId, cancellationToken);
                return Results.Ok(markers);
            })
            .RequireAuthorization();

        endpoints.MapPost(
            "/api/personal-content/world-portals/{grantId:guid}/enter",
            async (Guid grantId, ClaimsPrincipal user, WorldPortalService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                try
                {
                    // No client position or grant metadata is accepted: authoritative
                    // identity, movement state and walkable portal placement are server-side.
                    var marker = await service.EnterAsync(playerId, grantId, cancellationToken);
                    return Results.Ok(marker);
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.NotFound)
                {
                    return Results.NotFound(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
            })
            .RequireAuthorization()
            .RequireRateLimiting("portal-challenge");

        endpoints.MapPost(
            "/api/personal-content/{grantId:guid}/consume",
            async (Guid grantId, ClaimsPrincipal user, ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                try
                {
                    var grant = await service.ConsumeAsync(playerId, grantId, cancellationToken);
                    return Results.Ok(new
                    {
                        grant.Id,
                        grant.ContentKey,
                        grant.RewardKey,
                        itemKey = InventoryItemCatalog.IsSupported(grant.RewardKey) ? grant.RewardKey : null,
                        grant.ConsumedAtUtc
                    });
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.NotFound)
                {
                    return Results.NotFound(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Results.Conflict(new { code = ExclusiveContentErrorCodes.Consumed });
                }
            })
            .RequireAuthorization();

        endpoints.MapGet(
            "/api/personal-content/{grantId:guid}/challenge",
            async (Guid grantId, ClaimsPrincipal user, ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                try
                {
                    var challenge = await service.GetChallengeAsync(playerId, grantId, cancellationToken);
                    return Results.Ok(new { grantId, challenge.Version, challenge.Sequence });
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.NotFound)
                {
                    return Results.NotFound(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
            })
            .RequireAuthorization();

        endpoints.MapPost(
            "/api/personal-content/{grantId:guid}/challenge/attempt",
            async (Guid grantId, PortalSequenceAttemptRequest request, ClaimsPrincipal user,
                ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                try
                {
                    var grant = await service.SubmitChallengeAsync(playerId, grantId, request.Sequence, cancellationToken);
                    return Results.Ok(new
                    {
                        grant.Id,
                        grant.ContentKey,
                        itemKey = InventoryItemCatalog.IsSupported(grant.RewardKey) ? grant.RewardKey : null,
                        grant.ConsumedAtUtc
                    });
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.NotFound)
                {
                    return Results.NotFound(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.ChallengeInvalidAnswer)
                {
                    return Results.BadRequest(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception) when (exception.Code == ExclusiveContentErrorCodes.ChallengeIncorrect)
                {
                    return Results.UnprocessableEntity(new { code = exception.Code });
                }
                catch (ExclusiveContentException exception)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
                catch (DbUpdateConcurrencyException)
                {
                    return Results.Conflict(new { code = ExclusiveContentErrorCodes.Consumed });
                }
            })
            .RequireAuthorization()
            .RequireRateLimiting("portal-challenge");

        endpoints.MapPost(
            "/api/admin/personal-content/grants",
            async (GrantExclusiveContentRequest request, ExclusiveContentService service, CancellationToken cancellationToken) =>
            {
                try
                {
                    var grant = await service.GrantAsync(
                        new GrantExclusiveContentCommand(
                            request.SourceEventId,
                            request.PlayerId,
                            request.ContentKey,
                            request.PortalKey,
                            request.DialogBranchKey,
                            request.RewardKey,
                            request.Seed,
                            request.RuleVersion,
                            request.CorrelationId,
                            request.CausationId,
                            request.ExpiresAtUtc),
                        cancellationToken);

                    return Results.Created($"/api/admin/personal-content/grants/{grant.Id}", new
                    {
                        grant.Id,
                        grant.GrantEventId,
                        grant.SourceEventId,
                        grant.PlayerId,
                        grant.ContentKey,
                        grant.Seed,
                        grant.RuleVersion,
                        grant.CorrelationId,
                        grant.CausationId,
                        grant.CreatedAtUtc,
                        grant.ExpiresAtUtc
                    });
                }
                catch (ArgumentException exception)
                {
                    return Results.BadRequest(new { code = "exclusive_content_grant_invalid", detail = exception.Message });
                }
            })
            .RequireAuthorization("GameMaster");

        return endpoints;
    }

    private static object ToEquipmentResponse(EquipmentView view) => new
    {
        items = view.Items.Select(x => new
        {
            x.Slot,
            x.GrantId,
            x.ItemKey,
            x.EquippedAtUtc
        }),
        stats = view.Stats,
        ruleVersion = EquipmentRules.Version
    };

    private static object ToPlayerResponse(ExclusiveContentGrant grant) => new
    {
        grant.Id,
        grant.ContentKey,
        grant.PortalKey,
        grant.DialogBranchKey,
        grant.RewardKey,
        grant.ExpiresAtUtc
    };
}

public sealed record PortalSequenceAttemptRequest(string[]? Sequence);

public sealed record GrantExclusiveContentRequest(
    Guid SourceEventId,
    string PlayerId,
    string ContentKey,
    string PortalKey,
    string DialogBranchKey,
    string RewardKey,
    long Seed,
    string RuleVersion,
    Guid? CorrelationId,
    Guid? CausationId,
    DateTimeOffset? ExpiresAtUtc);
