using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Api.Auth;
using Vuxo.Api.Tests.Infrastructure;

namespace Vuxo.Api.Tests.Auth;

public sealed class MockAuthenticationTests
{
    [Theory]
    [InlineData("User")]
    [InlineData("GameMaster")]
    [InlineData("Administrator")]
    public async Task MockLogin_ReturnsBearerToken_ForAllowedRole(string role)
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: true);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = $"test-{role}",
            displayName = $"Test {role}",
            role
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        Assert.False(string.IsNullOrWhiteSpace(payload.AccessToken));
        Assert.Equal("Bearer", payload.TokenType);
    }

    [Fact]
    public async Task MockLogin_ReturnsBadRequest_ForUnknownRole()
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: true);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = "test-user",
            displayName = "Test User",
            role = "Owner"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("mock_role_invalid", payload?.Code);
    }

    [Theory]
    [InlineData("", "Test User", "mock_subject_required")]
    [InlineData("test-user", "", "mock_display_name_required")]
    public async Task MockLogin_ReturnsStableValidationCode_ForMissingIdentityData(
        string subject,
        string displayName,
        string expectedCode)
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: true);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName,
            role = "User"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(expectedCode, payload?.Code);
    }

    [Fact]
    public async Task MockLogin_IsNotMapped_WhenFlagIsDisabled()
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: false);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/mock", ValidRequest());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task MockLogin_IsNeverMapped_InProduction_EvenWhenFlagIsEnabled()
    {
        using var factory = new VuxoApiFactory("Production", enableMockLogin: true);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/mock", ValidRequest());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("GameMaster", "User", false)]
    [InlineData("GameMaster", "GameMaster", true)]
    [InlineData("GameMaster", "Administrator", true)]
    [InlineData("Administrator", "User", false)]
    [InlineData("Administrator", "GameMaster", false)]
    [InlineData("Administrator", "Administrator", true)]
    public async Task AuthorizationPolicies_EnforceExpectedRoles(string policyName, string role, bool expected)
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: true);
        using var scope = factory.Services.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();
        var principal = CreatePrincipal(role);

        var result = await authorization.AuthorizeAsync(principal, resource: null, policyName);

        Assert.Equal(expected, result.Succeeded);
    }

    [Theory]
    [InlineData("User", HttpStatusCode.Forbidden)]
    [InlineData("GameMaster", HttpStatusCode.Forbidden)]
    [InlineData("Administrator", HttpStatusCode.ServiceUnavailable)]
    public async Task MockToken_IsAcceptedByRestAuthentication_AndRoleAuthorization(
        string role,
        HttpStatusCode expectedStatus)
    {
        using var factory = new VuxoApiFactory("Test", enableMockLogin: true);
        using var client = factory.CreateClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject = $"rest-{role}",
            displayName = $"REST {role}",
            role
        });
        loginResponse.EnsureSuccessStatusCode();
        var login = await loginResponse.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var protectedResponse = await client.GetAsync("/api/admin/llm/tool-smoke");

        Assert.Equal(expectedStatus, protectedResponse.StatusCode);
    }

    [Fact]
    public void SignalRAccessTokenResolver_UsesQueryTokenOnlyForWorldHub()
    {
        var hubContext = new DefaultHttpContext();
        hubContext.Request.Path = "/hubs/world";
        hubContext.Request.QueryString = new QueryString("?access_token=signalr-token");

        var apiContext = new DefaultHttpContext();
        apiContext.Request.Path = "/api/meta/version";
        apiContext.Request.QueryString = new QueryString("?access_token=should-not-be-used");

        Assert.Equal("signalr-token", SignalRAccessTokenResolver.Resolve(hubContext.Request));
        Assert.Null(SignalRAccessTokenResolver.Resolve(apiContext.Request));
    }

    private static object ValidRequest() => new
    {
        subject = "test-user",
        displayName = "Test User",
        role = "User"
    };

    private static ClaimsPrincipal CreatePrincipal(string role)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "test-user"), new Claim(ClaimTypes.Role, role)],
            authenticationType: "Test");

        return new ClaimsPrincipal(identity);
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);

    private sealed record ErrorResponse(string Code);
}
