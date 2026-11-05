using Microsoft.EntityFrameworkCore;
using Npgsql;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class CharacterHealthPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task Migration_InitializesExistingCharactersToBaseMaxHealth()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync("202611040002_PlayerEquipment");
        // The existing schema has no CurrentHealth column yet.
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO player_characters (
                "Id", "OwnerId", "Name", "Level", "Strength", "Dexterity",
                "Intelligence", "Constitution", "Luck", "Faith", "HairStyle",
                "HairColor", "Face", "BodyType", "SkinTone", "TopColor",
                "BottomStyle", "BottomColor", "ShoeStyle", "ShoeColor"
            ) VALUES (
                '58f1f82d-b583-4fbe-97e5-2656ab26ccf7', 'legacy-player',
                'Legacy Vuxian', 0, 2, 2, 2, 2, 1, 1,
                'hair-1', 'black', 'face-1', 'body-1', 'skin-1',
                'blue', 'shorts', 'black', 'shoe-1', 'white'
            );
            """);
        await db.Database.MigrateAsync();
        var saved = await new PlayerCharacterRepository(db).GetByOwnerIdAsync("legacy-player");
        Assert.NotNull(saved);
        Assert.Equal(20, saved.CurrentHealth);
        Assert.Equal(20, saved.MaxHealth);
    }

    [PostgresIntegrationFact]
    public async Task CurrentHealth_RoundTripsAndDatabaseRejectsInvalidValues()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new PlayerCharacterRepository(db).AddAsync(PlayerCharacter.Create(
            "health-player", "Vuxian", PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();

        await db.Database.ExecuteSqlRawAsync(
            """UPDATE player_characters SET "CurrentHealth" = 7 WHERE "OwnerId" = 'health-player';""");
        var saved = await new PlayerCharacterRepository(db).GetByOwnerIdAsync("health-player");
        Assert.NotNull(saved);
        Assert.Equal(7, saved.CurrentHealth);
        Assert.Equal(20, saved.MaxHealth);

        foreach (var invalid in new[] { -1, 21 })
        {
            var exception = await Assert.ThrowsAsync<PostgresException>(async () =>
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""UPDATE player_characters SET "CurrentHealth" = {invalid} WHERE "OwnerId" = 'health-player';"""));
            Assert.Equal(PostgresErrorCodes.CheckViolation, exception.SqlState);
        }

        Assert.Equal(7, (await new PlayerCharacterRepository(db)
            .GetByOwnerIdAsync("health-player"))!.CurrentHealth);
    }
}
