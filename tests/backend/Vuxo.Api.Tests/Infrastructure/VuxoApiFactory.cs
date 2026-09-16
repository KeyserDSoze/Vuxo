using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Vuxo.Api.Tests.Infrastructure;

internal sealed class VuxoApiFactory(
    string environment = "Test",
    bool enableMockLogin = true,
    Action<IServiceCollection>? configureServices = null,
    IReadOnlyDictionary<string, string?>? configurationOverrides = null) : WebApplicationFactory<Program>
{
    internal const string TestSigningKey = "vuxo-tests-signing-key-that-is-at-least-32-characters-long";

    static VuxoApiFactory()
    {
        // Program validates this required secret before WebApplicationFactory applies
        // ConfigureWebHost callbacks. Environment variables mirror production bootstrap.
        Environment.SetEnvironmentVariable("Auth__Jwt__SigningKey", TestSigningKey);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            var values = new Dictionary<string, string?>
            {
                ["ConnectionStrings:GameDb"] = "Host=localhost;Database=vuxo_tests;Username=vuxo",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["World:Id"] = "vuxo-test-world",
                ["World:Seed"] = "424242",
                ["World:GeneratorVersion"] = "1",
                ["Auth:EnableMockLogin"] = enableMockLogin.ToString(),
                ["Auth:Jwt:Issuer"] = "Vuxo.Tests",
                ["Auth:Jwt:Audience"] = "Vuxo.Tests",
                ["Auth:Jwt:SigningKey"] = TestSigningKey,
                ["Llm:Enabled"] = "false",
                ["Redis:ConnectionString"] = string.Empty
            };

            if (configurationOverrides is not null)
            {
                foreach (var (key, value) in configurationOverrides)
                {
                    values[key] = value;
                }
            }

            configuration.AddInMemoryCollection(values);
        });

        if (configureServices is not null)
        {
            builder.ConfigureTestServices(configureServices);
        }
    }
}
