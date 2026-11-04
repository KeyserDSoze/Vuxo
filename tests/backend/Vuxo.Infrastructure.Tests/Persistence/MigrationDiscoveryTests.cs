using Microsoft.EntityFrameworkCore;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class MigrationDiscoveryTests
{
    [Fact]
    public void ApplicationMigrations_AreDiscoveredByEfCore()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql("Host=localhost;Database=vuxo_migration_discovery;Username=vuxo;Password=vuxo")
            .Options;

        using var dbContext = new VuxoDbContext(options);

        var migrations = dbContext.Database.GetMigrations().ToArray();

        Assert.Contains("202609160001_Initial", migrations);
        Assert.Contains("202609160002_WorldGeneration", migrations);
        Assert.Contains("202609160003_ExclusiveContent", migrations);
        Assert.Contains("202609160004_AuditQueries", migrations);
        Assert.Contains("202609210001_SocialIdentity", migrations);
        Assert.Contains("202611040001_PlayerInventoryAwards", migrations);
        Assert.Contains("202611040002_PlayerEquipment", migrations);
    }
}
