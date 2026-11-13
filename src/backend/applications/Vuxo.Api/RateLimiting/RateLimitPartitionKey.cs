using System.Net;
using System.Security.Claims;

namespace Vuxo.Api.RateLimiting;

public static class RateLimitPartitionKey
{
    public const string CloudflareConnectingIpHeader = "CF-Connecting-IP";

    /// <summary>
    /// Authenticated callers are limited per player; anonymous callers per client address.
    /// Behind the Cloudflare Tunnel the peer address is always the connector, so the edge-provided
    /// header is honoured only when the deployment declares that the API is reachable solely through it.
    /// </summary>
    public static string Resolve(HttpContext context, bool trustCloudflareConnectingIp)
    {
        var playerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(playerId))
        {
            return "player:" + playerId;
        }

        if (trustCloudflareConnectingIp
            && context.Request.Headers.TryGetValue(CloudflareConnectingIpHeader, out var header)
            && header.Count == 1
            && IPAddress.TryParse(header[0], out var forwarded))
        {
            return "ip:" + forwarded;
        }

        return "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    }
}
