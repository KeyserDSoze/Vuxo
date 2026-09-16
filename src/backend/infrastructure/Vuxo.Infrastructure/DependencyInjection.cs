using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Application.AI;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Domain.Worlds;
using Vuxo.Infrastructure.AI;
using Vuxo.Infrastructure.Persistence;

namespace Vuxo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddVuxoInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("GameDb")
            ?? throw new InvalidOperationException("ConnectionStrings:GameDb is required.");

        services.AddDbContext<VuxoDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IPlayerCharacterRepository, PlayerCharacterRepository>();
        services.AddScoped<IGameEventStore, GameEventStore>();
        services.AddScoped<IWorldRepository, WorldRepository>();
        services.AddScoped<IUnitOfWork>(provider => provider.GetRequiredService<VuxoDbContext>());

        var llmEnabled = bool.TryParse(configuration["Llm:Enabled"], out var enabled) && enabled;
        var llmBaseUrl = configuration["Llm:BaseUrl"] ?? "http://ollama:11434/v1";
        var llmModel = configuration["Llm:Model"] ?? "qwen3:1.7b";
        var configuredTimeout = int.TryParse(configuration["Llm:TimeoutSeconds"], out var timeoutSeconds)
            ? timeoutSeconds
            : 45;
        var llmTimeoutSeconds = Math.Clamp(configuredTimeout, 5, 300);

        services.AddSingleton<ILanguageModelGateway>(_ =>
        {
            var httpClient = new HttpClient
            {
                BaseAddress = new Uri(llmBaseUrl.TrimEnd('/') + "/"),
                Timeout = TimeSpan.FromSeconds(llmTimeoutSeconds)
            };

            return new OllamaLanguageModelGateway(httpClient, llmModel, llmEnabled);
        });

        return services;
    }
}
