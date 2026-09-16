using System.Diagnostics;
using System.Security.Claims;

namespace Vuxo.Api.Observability;

public sealed class TelemetryContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ILogger<TelemetryContextMiddleware> logger)
    {
        var requestedCorrelationId = TelemetrySanitizer.NormalizeCorrelationId(
            context.Request.Headers["X-Correlation-ID"].FirstOrDefault());
        var correlationId = requestedCorrelationId
            ?? Activity.Current?.TraceId.ToString()
            ?? Guid.NewGuid().ToString("N");
        var playerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);

        context.Response.Headers["X-Correlation-ID"] = correlationId;
        Activity.Current?.SetTag("vuxo.correlation_id", correlationId);
        if (!string.IsNullOrWhiteSpace(playerId))
        {
            Activity.Current?.SetTag("vuxo.player.id", playerId);
        }

        var sanitizedQuery = TelemetrySanitizer.SanitizeQuery(context.Request.QueryString.Value);
        if (!string.IsNullOrEmpty(sanitizedQuery))
        {
            Activity.Current?.SetTag("vuxo.http.query", sanitizedQuery);
        }

        using var scope = logger.BeginScope(new Dictionary<string, object?>
        {
            ["CorrelationId"] = correlationId,
            ["PlayerId"] = playerId
        });

        await next(context);
    }
}
