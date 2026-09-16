using System.Text.Json;
using Vuxo.Application.Events;
using Vuxo.Domain.Events;
using Vuxo.Application.Worlds.Realtime;

namespace Vuxo.Api.Admin;

public static class AuditEndpoints
{
    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin")
            .RequireAuthorization("Administrator");

        group.MapGet(
            "/audit/events",
            async (
                string? playerId,
                string? eventType,
                Guid? correlationId,
                DateTimeOffset? fromUtc,
                DateTimeOffset? toUtc,
                int? offset,
                int? limit,
                GameEventAuditService service,
                CancellationToken cancellationToken) =>
            {
                try
                {
                    var page = await service.QueryAsync(
                        playerId,
                        eventType,
                        correlationId,
                        fromUtc,
                        toUtc,
                        offset ?? 0,
                        limit ?? GameEventAuditService.DefaultLimit,
                        cancellationToken);

                    return Results.Ok(new
                    {
                        page.Total,
                        page.Offset,
                        page.Limit,
                        items = page.Items.Select(ToSummary)
                    });
                }
                catch (ArgumentException exception)
                {
                    return Results.BadRequest(new { code = "audit_query_invalid", detail = exception.Message });
                }
            });

        group.MapGet(
            "/audit/events/{eventId:guid}",
            async (Guid eventId, GameEventAuditService service, CancellationToken cancellationToken) =>
            {
                try
                {
                    var record = await service.GetByIdAsync(eventId, cancellationToken);
                    return Results.Ok(ToDetail(record));
                }
                catch (KeyNotFoundException)
                {
                    return Results.NotFound(new { code = "audit_event_not_found" });
                }
                catch (ArgumentException exception)
                {
                    return Results.BadRequest(new { code = "audit_event_invalid", detail = exception.Message });
                }
            });

        group.MapGet(
            "/online-players",
            (WorldSimulation simulation) => Results.Ok(new
            {
                players = simulation.Snapshot().Select(player => new
                {
                    player.PlayerId,
                    player.CharacterId,
                    player.CharacterName,
                    player.X,
                    player.Y,
                    player.SpeedMultiplier,
                    player.Revision
                })
            }));

        group.MapGet(
            "/observability",
            (IConfiguration configuration) => Results.Ok(new
            {
                enabled = configuration.GetValue("Observability:Enabled", true),
                exporterConfigured = Uri.TryCreate(
                    configuration["Observability:OtlpEndpoint"],
                    UriKind.Absolute,
                    out _),
                dashboardUrl = NormalizeDashboardUrl(configuration["Observability:GrafanaUrl"])
            }));

        return endpoints;
    }

    private static string? NormalizeDashboardUrl(string? value)
        => Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.Scheme is "http" or "https"
                ? uri.ToString().TrimEnd('/')
                : null;

    private static object ToSummary(GameEventRecord record) => new
    {
        record.Envelope.EventId,
        record.Envelope.EventType,
        visibilityScope = record.Envelope.VisibilityScope.ToString().ToLowerInvariant(),
        record.Envelope.PlayerId,
        record.Envelope.CorrelationId,
        record.Envelope.CausationId,
        record.Envelope.RuleVersion,
        record.Envelope.OccurredAtUtc
    };

    private static object ToDetail(GameEventRecord record) => new
    {
        record.Envelope.EventId,
        record.Envelope.EventType,
        visibilityScope = record.Envelope.VisibilityScope.ToString().ToLowerInvariant(),
        record.Envelope.PlayerId,
        record.Envelope.CorrelationId,
        record.Envelope.CausationId,
        record.Envelope.RuleVersion,
        record.Envelope.OccurredAtUtc,
        payload = ParsePayload(record.PayloadJson)
    };

    private static JsonElement ParsePayload(string payloadJson)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                schemaVersion = 0,
                kind = "legacy.invalid-json",
                data = new { raw = payloadJson }
            }));
            return document.RootElement.Clone();
        }
    }
}
