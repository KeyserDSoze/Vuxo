using Microsoft.EntityFrameworkCore;
using Vuxo.Infrastructure.Persistence;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class MigrationDiscoveryTests
{
    [Fact]
    public void InitialMigration_IsDiscoveredByEfCore()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql("Host=localhost;Database=vuxo_migration_discovery;Username=vuxo;Password=vuxo")
            .Options;

        using var dbContext = new VuxoDbContext(options);

        var migrations = dbContext.Database.GetMigrations();

        Assert.Contains("202609160001_Initial", migrations);
    }
}
