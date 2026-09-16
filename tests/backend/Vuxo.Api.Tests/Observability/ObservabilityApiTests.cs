using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Vuxo.Api.Tests.Infrastructure;

namespace Vuxo.Api.Tests.Observability;

public sealed class ObservabilityApiTests
{
    [Fact]
    public async Task Metadata_RequiresAdministrator()
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "user-a", "User");

        var response = await client.GetAsync("/api/admin/observability");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Metadata_ExposesOnlySafeObservabilityConfiguration()
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "admin-a", "Administrator");

        var response = await client.GetAsync("/api/admin/observability");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.True(root.GetProperty("enabled").GetBoolean());
        Assert.True(root.GetProperty("exporterConfigured").ValueKind is JsonValueKind.True or JsonValueKind.False);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("dashboardUrl").ValueKind);
        Assert.False(root.TryGetProperty("otlpEndpoint", out _));
        Assert.False(root.TryGetProperty("samplingRatio", out _));
    }

    [Fact]
    public async Task Requests_ReturnCorrelationIdHeader()
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("X-Correlation-ID", "test-correlation-123");

        var response = await client.SendAsync(request);

        response.EnsureSuccessStatusCode();
        Assert.Equal("test-correlation-123", response.Headers.GetValues("X-Correlation-ID").Single());
    }

    private static async Task AuthenticateAsync(HttpClient client, string subject, string role)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = subject,
            role
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", payload.AccessToken);
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
}
