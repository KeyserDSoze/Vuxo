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
        Assert.Contains("202611050001_PlayerCurrentHealth", migrations);
        Assert.Contains("202611050002_CharacterRestActions", migrations);
        Assert.Contains("202611050003_CharacterItemHealing", migrations);
        Assert.Contains("202611050004_PortalMistakeDamage", migrations);
        Assert.Contains("202611050005_PortalEncounterState", migrations);
        Assert.Contains("202611050006_PortalGuardianShowdown", migrations);
        Assert.Contains("202611050007_PortalGuardianV2Feint", migrations);
    }

    [Fact]
    public void ApplicationMigrations_AreExactlyTheCheckedInOrderedSet()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql("Host=localhost;Database=vuxo_migration_discovery;Username=vuxo;Password=vuxo")
            .Options;

        using var dbContext = new VuxoDbContext(options);

        // Adding or dropping a migration must be an explicit change to this list.
        Assert.Equal(
            [
                "202609160001_Initial",
                "202609160002_WorldGeneration",
                "202609160003_ExclusiveContent",
                "202609160004_AuditQueries",
                "202609210001_SocialIdentity",
                "202611040001_PlayerInventoryAwards",
                "202611040002_PlayerEquipment",
                "202611050001_PlayerCurrentHealth",
                "202611050002_CharacterRestActions",
                "202611050003_CharacterItemHealing",
                "202611050004_PortalMistakeDamage",
                "202611050005_PortalEncounterState",
                "202611050006_PortalGuardianShowdown",
                "202611050007_PortalGuardianV2Feint",
                "202611060001_PortalCompletionHistoryIndex",
                "202611060002_PortalOutcomeHistoryIndexes",
                "202611060003_PortalRewardProvenanceIndex",
                "202611090001_CharacterAppearanceRevision",
                "202611130001_PortalMistakeDamageCharacterIndex"
            ],
            dbContext.Database.GetMigrations().ToArray());
    }

    [Fact]
    public void ModelSnapshot_MatchesTheCurrentModel()
    {
        var options = new DbContextOptionsBuilder<VuxoDbContext>()
            .UseNpgsql("Host=localhost;Database=vuxo_migration_discovery;Username=vuxo;Password=vuxo")
            .Options;

        using var dbContext = new VuxoDbContext(options);

        // Fails when the model changed without `dotnet ef migrations add`.
        Assert.False(dbContext.Database.HasPendingModelChanges());
    }
}
