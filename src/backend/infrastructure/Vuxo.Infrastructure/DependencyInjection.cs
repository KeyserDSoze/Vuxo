using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Application.AI;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Identity;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Domain.Worlds;
using Vuxo.Infrastructure.AI;
using Vuxo.Infrastructure.Persistence;

namespace Vuxo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddVuxoInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("GameDb");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:GameDb is required and cannot be empty.");
        }

        services.AddDbContext<VuxoDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IPlayerCharacterRepository, PlayerCharacterRepository>();
        services.AddScoped<ICharacterRestRepository, CharacterRestRepository>();
        services.AddScoped<ICharacterHealingRepository, CharacterHealingRepository>();
        services.AddScoped<IPortalMistakeDamageRepository, PortalMistakeDamageRepository>();
        services.AddScoped<IPortalEncounterRepository, PortalEncounterRepository>();
        services.AddScoped<IPortalGuardianRepository, PortalGuardianRepository>();
        services.AddScoped<IGameEventStore, GameEventStore>();
        services.AddScoped<IWorldRepository, WorldRepository>();
        services.AddScoped<IExclusiveContentGrantRepository, ExclusiveContentGrantRepository>();
        services.AddScoped<IPortalCompletionHistoryReader, PortalCompletionHistoryReader>();
        services.AddScoped<IPlayerInventoryRepository, PlayerInventoryRepository>();
        services.AddScoped<IPlayerEquipmentRepository, PlayerEquipmentRepository>();
        services.AddScoped<IVuxoIdentityRepository, VuxoIdentityRepository>();
        services.AddScoped<IUnitOfWork>(provider => provider.GetRequiredService<VuxoDbContext>());

        var llmEnabled = bool.TryParse(configuration["Llm:Enabled"], out var enabled) && enabled;
        var llmBaseUrl = configuration["Llm:BaseUrl"] ?? "http://ollama:11434/v1";
        var llmModel = configuration["Llm:Model"] ?? "qwen3:1.7b";
        var configuredTimeout = int.TryParse(configuration["Llm:TimeoutSeconds"], out var timeoutSeconds)
            ? timeoutSeconds
            : 45;
        var llmTimeoutSeconds = Math.Clamp(configuredTimeout, 5, 300);

        var maxRetries = ParseInt(configuration["Llm:MaxRetries"], 1);
        var failureThreshold = ParseInt(configuration["Llm:CircuitFailureThreshold"], 3);
        var circuitBreakSeconds = ParseInt(configuration["Llm:CircuitBreakSeconds"], 30);
        var retryDelayMilliseconds = ParseInt(configuration["Llm:RetryDelayMilliseconds"], 100);
        var resilience = OllamaResilienceOptions.Create(
            maxRetries,
            failureThreshold,
            circuitBreakSeconds,
            retryDelayMilliseconds);

        services.AddSingleton<OllamaLanguageModelGateway>(provider =>
        {
            var httpClient = new HttpClient
            {
                BaseAddress = new Uri(llmBaseUrl.TrimEnd('/') + "/"),
                Timeout = TimeSpan.FromSeconds(llmTimeoutSeconds)
            };
            var timeProvider = provider.GetService<TimeProvider>() ?? TimeProvider.System;
            return new OllamaLanguageModelGateway(
                httpClient,
                llmModel,
                llmEnabled,
                resilience,
                timeProvider);
        });
        services.AddSingleton<ILanguageModelGateway>(provider =>
            provider.GetRequiredService<OllamaLanguageModelGateway>());
        services.AddSingleton<ILanguageModelHealthProbe>(provider =>
            provider.GetRequiredService<OllamaLanguageModelGateway>());

        return services;
    }

    private static int ParseInt(string? value, int fallback) =>
        int.TryParse(value, out var parsed) ? parsed : fallback;
}
