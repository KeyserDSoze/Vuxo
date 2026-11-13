using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Vuxo.Api.RateLimiting;

namespace Vuxo.Api.Tests.RateLimiting;

public sealed class RateLimitPartitionKeyTests
{
    [Theory]
    [InlineData(false, "203.0.113.9", "10.0.0.5", "ip:10.0.0.5")]
    [InlineData(true, "203.0.113.9", "10.0.0.5", "ip:203.0.113.9")]
    [InlineData(true, "not-an-ip", "10.0.0.5", "ip:10.0.0.5")]
    [InlineData(true, null, "10.0.0.5", "ip:10.0.0.5")]
    [InlineData(false, null, null, "ip:unknown")]
    public void Anonymous_UsesEdgeHeaderOnlyWhenTrusted(
        bool trustEdgeHeader, string? edgeHeader, string? peer, string expected)
    {
        var context = CreateContext(peer, edgeHeader, playerId: null);

        Assert.Equal(expected, RateLimitPartitionKey.Resolve(context, trustEdgeHeader));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Authenticated_IsPartitionedPerPlayerRegardlessOfSharedTunnelAddress(bool trustEdgeHeader)
    {
        var first = CreateContext("10.0.0.5", "203.0.113.9", "player-a");
        var second = CreateContext("10.0.0.5", "203.0.113.9", "player-b");

        Assert.Equal("player:player-a", RateLimitPartitionKey.Resolve(first, trustEdgeHeader));
        Assert.NotEqual(
            RateLimitPartitionKey.Resolve(first, trustEdgeHeader),
            RateLimitPartitionKey.Resolve(second, trustEdgeHeader));
    }

    [Fact]
    public void RepeatedEdgeHeaderIsIgnored()
    {
        var context = CreateContext("10.0.0.5", null, null);
        context.Request.Headers[RateLimitPartitionKey.CloudflareConnectingIpHeader] = new[] { "203.0.113.9", "198.51.100.1" };

        Assert.Equal("ip:10.0.0.5", RateLimitPartitionKey.Resolve(context, trustCloudflareConnectingIp: true));
    }

    private static DefaultHttpContext CreateContext(string? peer, string? edgeHeader, string? playerId)
    {
        var context = new DefaultHttpContext();
        if (peer is not null)
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
        }

        if (edgeHeader is not null)
        {
            context.Request.Headers[RateLimitPartitionKey.CloudflareConnectingIpHeader] = edgeHeader;
        }

        if (playerId is not null)
        {
            context.User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, playerId)], authenticationType: "test"));
        }

        return context;
    }
}
