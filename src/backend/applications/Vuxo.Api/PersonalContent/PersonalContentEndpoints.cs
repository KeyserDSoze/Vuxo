using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Vuxo.Application.PersonalContent;
using Vuxo.Application.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.Players;

namespace Vuxo.Api.PersonalContent;

public static class PersonalContentEndpoints
{
    public static IEndpointRouteBuilder MapPersonalContentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(
            "/api/inventory",
            async (ClaimsPrincipal user, ExclusiveContentService service,
                IPlayerInventoryRepository inventory, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                var awards = await service.GetInventoryAsync(playerId, cancellationToken);
                var consumed = await inventory.GetConsumedGrantIdsForPlayerAsync(playerId, cancellationToken);
                return Results.Ok(awards.Select(award => new
                {
                    award.GrantId,
                    award.ItemKey,
                    quantity = PlayerInventoryAward.Quantity,
                    award.AwardedAtUtc,
                    consumed = consumed.Contains(award.GrantId)
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
                catch (DbUpdateConcurrencyException)
                {
                    return Results.Conflict(new { code = "equipment_conflict" });
                }
                catch (DbUpdateException)
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

        // Only persisted and causally audited sequence completions are victories.
        // A consumed grant or an inventory reward alone is never proof.
        endpoints.MapGet(
            "/api/personal-content/history/completed",
            async (ClaimsPrincipal user, IPortalCompletionHistoryReader history,
                int? page, int? pageSize, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                var requestedPage = page ?? 1;
                var requestedSize = pageSize ?? 20;
                if (requestedPage is < 1 or > 1000 || requestedSize is < 1 or > 50)
                {
                    return Results.BadRequest(new { code = "portal_history_invalid_pagination" });
                }

                return Results.Ok(await history.ListCompletedForPlayerAsync(
                    playerId, requestedPage, requestedSize, cancellationToken));
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
            async (Guid grantId, ClaimsPrincipal user, WorldPortalService service,
                PortalEncounterService encounters, CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();

                try
                {
                    // No client position or grant metadata is accepted: authoritative
                    // identity, movement state and walkable portal placement are server-side.
                    var marker = await service.EnterAsync(playerId, grantId, cancellationToken);
                    await encounters.StartVerifiedPortalAsync(playerId, grantId, cancellationToken);
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
                catch (PortalEncounterException exception) when (
                    exception.Code is PortalEncounterErrorCodes.CharacterRequired or PortalEncounterErrorCodes.InvalidPortal)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
                catch (PortalEncounterException exception)
                {
                    return Results.Conflict(new { code = exception.Code });
                }
            })
            .RequireAuthorization()
            .RequireRateLimiting("portal-challenge");

        // A Guardian battle cannot be opened by the browser. The turn endpoint
        // requires a live, server-verified encounter from world-portal entry.
        endpoints.MapGet(
            "/api/characters/me/portal-guardian/{grantId:guid}",
            async (Guid grantId, ClaimsPrincipal user, PortalGuardianService guardian,
                CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                var status = await guardian.GetAsync(playerId, grantId, cancellationToken);
                return status is null ? Results.NotFound(new
                {
                    code = PortalGuardianErrorCodes.Unavailable
                }) : Results.Ok(status);
            }).RequireAuthorization();

        endpoints.MapGet(
            "/api/characters/me/portal-guardian/{grantId:guid}/history",
            async (Guid grantId, ClaimsPrincipal user, PortalGuardianService guardian,
                CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                var history = await guardian.GetHistoryAsync(playerId, grantId, cancellationToken);
                return history is null ? Results.NotFound(new
                {
                    code = PortalGuardianErrorCodes.Unavailable
                }) : Results.Ok(history);
            }).RequireAuthorization();

        endpoints.MapPost(
            "/api/characters/me/portal-guardian/{grantId:guid}/turn",
            async (Guid grantId, PortalGuardianTurnRequest request,
                HttpRequest http, ClaimsPrincipal user, PortalGuardianService guardian,
                CancellationToken cancellationToken) =>
            {
                var playerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrWhiteSpace(playerId)) return Results.Unauthorized();
                if (!http.Headers.TryGetValue("Idempotency-Key", out var raw)
                    || !Guid.TryParse(raw.ToString(), out var key) || key == Guid.Empty)
                    return Results.BadRequest(new { code = PortalGuardianErrorCodes.KeyRequired });
                try
                {
                    return Results.Ok(await guardian.PlayAsync(
                        playerId, grantId, request.Action ?? "",
                        request.ExpectedTurn, key, cancellationToken));
                }
                catch (PortalGuardianException exception) when (exception.Code is
                    PortalGuardianErrorCodes.InvalidAction or PortalGuardianErrorCodes.InvalidTurn
                        or PortalGuardianErrorCodes.KeyRequired)
                {
                    return Results.BadRequest(new { code = exception.Code });
                }
                catch (PortalGuardianException exception) when (
                    exception.Code == PortalGuardianErrorCodes.Unavailable)
                {
                    return Results.NotFound(new { code = exception.Code });
                }
                catch (PortalGuardianException exception)
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
                ExclusiveContentService service, PortalMistakeDamageService damageService,
                CancellationToken cancellationToken) =>
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
                    // The answer was well-formed and rejected by canonical server
                    // sequence rules. The damage service rechecks ownership,
                    // expiry and consumption state inside a locked DB transaction.
                    var damage = await damageService.ApplyFirstMistakeAsync(
                        playerId, grantId, cancellationToken);
                    return Results.UnprocessableEntity(new
                    {
                        code = exception.Code,
                        damage = damage?.Damage ?? 0,
                        currentHealth = damage?.CurrentHealth,
                        maxHealth = damage?.MaxHealth,
                        damageApplied = damage?.Applied ?? false
                    });
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
public sealed record PortalGuardianTurnRequest(string? Action, int ExpectedTurn);

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
