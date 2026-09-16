using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vuxo.Infrastructure.Persistence;

public sealed class VuxoDbContextFactory : IDesignTimeDbContextFactory<VuxoDbContext>
{
    public VuxoDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("VUXO_DESIGNTIME_CONNECTION_STRING")
            ?? "Host=localhost;Port=5432;Database=vuxo;Username=vuxo;Password=CHANGE_ME";

        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new VuxoDbContext(options);
    }
}
