using Microsoft.EntityFrameworkCore;
using Xunit;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class CharacterAppearancePersistenceTests
{
    [PostgresIntegrationFact]
    public async Task AppearanceRevisionMigration_AndOwnerScopedCompareAndSwap_PreserveAllStats()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            var characters = new PlayerCharacterRepository(setup);
            await characters.AddAsync(NewCharacter("owner-one", "Vuxian One"));
            await characters.AddAsync(NewCharacter("owner-two", "Vuxian Two"));
            await setup.SaveChangesAsync();
        }

        var requested = NewCharacter("unused", "Vuxian Test").Appearance with
        {
            HairStyle = "hair-3", HairColor = "red", TopColor = "green",
            BottomStyle = "skirt", SkinTone = "skin-5"
        };
        await using (var db = database.CreateDbContext())
        {
            var store = new CharacterAppearanceRepository(db);
            Assert.False(await store.TryUpdateAsync("owner-two", 7, requested));
            Assert.False(await store.TryUpdateAsync("unknown-owner", 0, requested));
            Assert.True(await store.TryUpdateAsync("owner-one", 0, requested));
            Assert.False(await store.TryUpdateAsync("owner-one", 0, requested));
        }

        await using var verify = database.CreateDbContext();
        var owner = await new PlayerCharacterRepository(verify).GetByOwnerIdAsync("owner-one");
        var other = await new PlayerCharacterRepository(verify).GetByOwnerIdAsync("owner-two");
        Assert.NotNull(owner);
        Assert.NotNull(other);
        Assert.Equal(1, owner.AppearanceRevision);
        Assert.Equal(requested, owner.Appearance);
        Assert.Equal(0, other.AppearanceRevision);
        Assert.Equal("black", other.Appearance.HairColor);
        Assert.Equal(2, owner.Attributes.Strength);
        Assert.Equal(2, owner.Attributes.Dexterity);
        Assert.Equal(1, owner.Attributes.Luck); // No stat edits.
        Assert.Equal(owner.MaxHealth, owner.CurrentHealth);
        Assert.Equal(0, owner.Level);
    }

    [PostgresIntegrationFact]
    public async Task SimultaneousSaves_WithSameRevision_OnlyOneCanCommit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            await new PlayerCharacterRepository(setup).AddAsync(NewCharacter("same-owner", "Vuxian One"));
            await setup.SaveChangesAsync();
        }

        async Task<bool> AttemptAsync(string color)
        {
            await using var db = database.CreateDbContext();
            var appearance = NewCharacter("unused", "Vuxian Test").Appearance with { HairColor = color };
            return await new CharacterAppearanceRepository(db).TryUpdateAsync("same-owner", 0, appearance);
        }

        var outcomes = await Task.WhenAll(AttemptAsync("red"), AttemptAsync("blue"));
        Assert.Single(outcomes, value => value);
        await using var verify = database.CreateDbContext();
        var character = await new PlayerCharacterRepository(verify).GetByOwnerIdAsync("same-owner");
        Assert.NotNull(character);
        Assert.Equal(1, character.AppearanceRevision);
        Assert.Contains(character.Appearance.HairColor, new[] { "red", "blue" });
    }

    private static PlayerCharacter NewCharacter(string owner, string name)
        => PlayerCharacter.Create(owner, name,
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "shorts", "black", "shoe-1", "white"));
}
