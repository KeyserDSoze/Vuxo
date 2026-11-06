using System.Security.Claims;
using Microsoft.AspNetCore.RateLimiting;
using Vuxo.Application.Activities;
using Vuxo.Domain.Activities;

namespace Vuxo.Api.Activities;

/// <summary>JWT-only run intentions. Never accepts puzzle, rules, timer or reward claims.</summary>
public static class OffworldRunEndpoints
{
    public static IEndpointRouteBuilder MapOffworldRunEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/activities/runs/{activityKey}", async (
            string activityKey, HttpRequest request, ClaimsPrincipal user,
            OffworldRunService service, CancellationToken cancellationToken) =>
        {
            var owner = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(owner)) return Results.Unauthorized();
            if (!TryKey(request, out var key))
                return Results.BadRequest(new { code = OffworldRunErrorCodes.KeyRequired });
            try
            {
                var run = await service.StartAsync(owner, activityKey, key, cancellationToken);
                return run.Replayed
                    ? Results.Ok(run)
                    : Results.Created($"/api/activities/runs/{run.RunId}", run);
            }
            catch (OffworldRunException e) { return Error(e); }
        }).RequireAuthorization().RequireRateLimiting("activity-run");

        // Discovery is read-only and owner-scoped. An unknown, expired or
        // completed run must never be returned, including to a second device.
        endpoints.MapGet("/api/activities/runs/active/rune-path", async (
            ClaimsPrincipal user, OffworldRunService service,
            CancellationToken cancellationToken) =>
        {
            var owner = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(owner)) return Results.Unauthorized();
            var run = await service.GetActiveAsync(owner, cancellationToken);
            return run is null ? Results.NoContent() : Results.Ok(run);
        }).RequireAuthorization().RequireRateLimiting("activity-run");

        endpoints.MapGet("/api/activities/runs/{runId:guid}", async (
            Guid runId, ClaimsPrincipal user, OffworldRunService service,
            CancellationToken cancellationToken) =>
        {
            var owner = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(owner)) return Results.Unauthorized();
            var run = await service.GetAsync(owner, runId, cancellationToken);
            return run is null
                ? Results.NotFound(new { code = OffworldRunErrorCodes.NotFound })
                : Results.Ok(run);
        }).RequireAuthorization().RequireRateLimiting("activity-run");

        endpoints.MapPost("/api/activities/runs/{runId:guid}/complete", async (
            Guid runId, CompleteRunRequest payload, HttpRequest request,
            ClaimsPrincipal user, OffworldRunService service,
            CancellationToken cancellationToken) =>
        {
            var owner = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(owner)) return Results.Unauthorized();
            if (!TryKey(request, out var key))
                return Results.BadRequest(new { code = OffworldRunErrorCodes.KeyRequired });
            try
            {
                return Results.Ok(await service.CompleteAsync(owner, runId, key,
                    payload.Moves, cancellationToken));
            }
            catch (OffworldRunException e) { return Error(e); }
        }).RequireAuthorization().RequireRateLimiting("activity-run");

        return endpoints;
    }

    private static bool TryKey(HttpRequest request, out Guid key) =>
        Guid.TryParse(request.Headers["Idempotency-Key"].ToString(), out key)
            && key != Guid.Empty;

    private static IResult Error(OffworldRunException e) =>
        e.Code switch
        {
            OffworldRunErrorCodes.CharacterNotFound or OffworldRunErrorCodes.NotFound =>
                Results.NotFound(new { code = e.Code }),
            OffworldRunErrorCodes.KeyRequired =>
                Results.BadRequest(new { code = e.Code }),
            OffworldRunErrorCodes.InvalidPath =>
                Results.UnprocessableEntity(new { code = e.Code }),
            OffworldRunErrorCodes.Expired =>
                Results.Json(new { code = e.Code }, statusCode: StatusCodes.Status410Gone),
            OffworldRunErrorCodes.DailyLimit =>
                Results.Json(new { code = e.Code }, statusCode: StatusCodes.Status429TooManyRequests),
            _ => Results.Conflict(new { code = e.Code, nextAllowedAtUtc = e.NextAllowedAtUtc })
        };
}

public sealed record CompleteRunRequest(string? Moves);
