using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Vuxo.Api.Observability;

namespace Vuxo.Api.Tests.Observability;

public sealed class TelemetryContextMiddlewareTests
{
    [Fact]
    public async Task Middleware_EnrichesActivityAndResponseWithoutLeakingToken()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers["X-Correlation-ID"] = "corr-42";
        context.Request.QueryString = new QueryString("?access_token=secret-token&mode=world");
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "player-a")
        ], "test"));

        using var activity = new Activity("test-request").Start();
        var middleware = new TelemetryContextMiddleware(
            _ => Task.CompletedTask);

        await middleware.InvokeAsync(
            context,
            NullLogger<TelemetryContextMiddleware>.Instance);

        Assert.Equal("corr-42", context.Response.Headers["X-Correlation-ID"].ToString());
        Assert.Equal("corr-42", activity.GetTagItem("vuxo.correlation_id"));
        Assert.Equal("player-a", activity.GetTagItem("vuxo.player.id"));
        var query = Assert.IsType<string>(activity.GetTagItem("vuxo.http.query"));
        Assert.Contains("mode=world", query, StringComparison.Ordinal);
        Assert.Contains(TelemetrySanitizer.Redacted, Uri.UnescapeDataString(query), StringComparison.Ordinal);
        Assert.DoesNotContain("secret-token", query, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Middleware_ReplacesUnsafeCorrelationId()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers["X-Correlation-ID"] = "unsafe correlation value";
        using var activity = new Activity("test-request").Start();
        var middleware = new TelemetryContextMiddleware(
            _ => Task.CompletedTask);

        await middleware.InvokeAsync(
            context,
            NullLogger<TelemetryContextMiddleware>.Instance);

        var correlationId = context.Response.Headers["X-Correlation-ID"].ToString();
        Assert.NotEmpty(correlationId);
        Assert.NotEqual("unsafe correlation value", correlationId);
        Assert.Equal(activity.TraceId.ToString(), correlationId);
    }
}
