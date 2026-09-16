using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
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
        services.AddScoped<IUnitOfWork>(provider => provider.GetRequiredService<VuxoDbContext>());
        return services;
    }
}
