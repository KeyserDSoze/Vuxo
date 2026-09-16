using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Infrastructure;

namespace Vuxo.Api.Tests.Foundation;

public sealed class ApiFoundationTests
{
    [Fact]
    public async Task Health_ReturnsOk()
    {
        using var factory = new VuxoApiFactory(enableMockLogin: false);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Version_ExposesVersionCommitBuildDateAndEnvironment()
    {
        const string commit = "0123456789abcdef";
        const string buildDate = "2026-09-16T20:00:00Z";
        using var factory = new VuxoApiFactory(
            environment: "Test",
            enableMockLogin: false,
            configurationOverrides: new Dictionary<string, string?>
            {
                ["Build:CommitSha"] = commit,
                ["Build:BuildDateUtc"] = buildDate
            });
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/meta/version");
        response.EnsureSuccessStatusCode();

        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = payload.RootElement;

        Assert.Equal("Vuxo", root.GetProperty("application").GetString());
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("version").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("informationalVersion").GetString()));
        Assert.Equal(commit, root.GetProperty("commit").GetString());
        Assert.Equal(buildDate, root.GetProperty("buildDateUtc").GetString());
        Assert.Equal("Test", root.GetProperty("environment").GetString());
    }

    [Theory]
    [InlineData("Development", HttpStatusCode.OK)]
    [InlineData("Production", HttpStatusCode.NotFound)]
    public async Task OpenApi_IsAvailableOnlyInDevelopment(string environment, HttpStatusCode expectedStatus)
    {
        using var factory = new VuxoApiFactory(environment, enableMockLogin: false);
        using var client = factory.CreateClient(new() { AllowAutoRedirect = false });

        var response = await client.GetAsync("/openapi/v1.json");

        Assert.Equal(expectedStatus, response.StatusCode);
    }

    [Fact]
    public void InfrastructureRegistration_RejectsBlankDatabaseConnectionString()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:GameDb"] = "   "
            })
            .Build();
        var services = new ServiceCollection();

        var exception = Assert.Throws<InvalidOperationException>(() => services.AddVuxoInfrastructure(configuration));

        Assert.Equal("ConnectionStrings:GameDb is required and cannot be empty.", exception.Message);
    }
}
