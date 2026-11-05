using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalMistakeDamagePersistenceTests
{
    [PostgresIntegrationFact]
    public async Task FirstMistake_DamagesTwoOnce_AndAuditsPrivateGrantCausation()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            var store = NewStore(db);
            var first = await store.ApplyFirstMistakeAsync("player-a", grant.Id, now);
            Assert.NotNull(first);
            Assert.Equal(20, first.PreviousHealth);
            Assert.Equal(18, first.CurrentHealth);
            Assert.Equal(2, first.Damage);
            Assert.True(first.Applied);
        }
        await using (var db = database.CreateDbContext())
        {
            var repeat = await NewStore(db).ApplyFirstMistakeAsync("player-a",
                grant.Id, now.AddMinutes(1));
            Assert.NotNull(repeat);
            Assert.False(repeat.Applied);
            Assert.Equal(0, repeat.Damage);
            Assert.Equal(18, repeat.CurrentHealth);
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(18, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        var receipt = Assert.Single(await verify.PortalMistakeDamages.ToListAsync());
        Assert.Equal(grant.Id, receipt.GrantId);
        var stored = Assert.Single((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
        Assert.Equal("portal.sequence_mistake_damage", stored.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Player, stored.Envelope.VisibilityScope);
        Assert.Equal(grant.CorrelationId, stored.Envelope.CorrelationId);
        Assert.Equal(grant.GrantEventId, stored.Envelope.CausationId);
        Assert.Equal(PortalMistakeDamageRules.Version, stored.Envelope.RuleVersion);
        using var payload = JsonDocument.Parse(stored.PayloadJson);
        var data = payload.RootElement.GetProperty("data");
        Assert.Equal(20, data.GetProperty("previousHealth").GetInt32());
        Assert.Equal(18, data.GetProperty("currentHealth").GetInt32());
        Assert.Equal(2, data.GetProperty("damage").GetInt32());
    }

    [PostgresIntegrationFact]
    public async Task TwoApiNodes_OnlyFirstMistakeCausesDamage()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        async Task<PortalMistakeDamageResult?> WrongAsync()
        {
            await using var db = database.CreateDbContext();
            return await NewStore(db).ApplyFirstMistakeAsync(
                "player-a", grant.Id, DateTimeOffset.UtcNow);
        }

        var results = await Task.WhenAll(WrongAsync(), WrongAsync());
        Assert.All(results, Assert.NotNull);
        Assert.Single(results, x => x?.Applied == true);
        Assert.Single(results, x => x?.Applied == false);
        Assert.Equal(2, results.Sum(x => x!.Damage));
        await using var verify = database.CreateDbContext();
        Assert.Single(await verify.PortalMistakeDamages.ToListAsync());
        Assert.Equal(18, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
    }

    [PostgresIntegrationFact]
    public async Task RestAfterDamage_UsesTheSameCanonicalHealth()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            await NewStore(db).ApplyFirstMistakeAsync("player-a", grant.Id, now);
        }
        await using (var db = database.CreateDbContext())
        {
            var rest = await new CharacterRestRepository(db, new GameEventStore(db))
                .RestAsync("player-a", Guid.NewGuid(), now.AddMinutes(1));
            Assert.Equal(18, rest.PreviousHealth);
            Assert.Equal(20, rest.CurrentHealth);
            Assert.Equal(2, rest.RestoredHealth);
        }
        await using var verify = database.CreateDbContext();
        Assert.Equal(20, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
    }

    [PostgresIntegrationFact]
    public async Task ForeignExpiredOrConsumedGrant_CannotInflictDamage()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            var store = NewStore(db);
            Assert.Null(await store.ApplyFirstMistakeAsync("other-player", grant.Id, now));
            Assert.Null(await store.ApplyFirstMistakeAsync("player-a", grant.Id, now.AddDays(2)));
        }
        await using (var db = database.CreateDbContext())
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE exclusive_content_grants SET \"ConsumedAtUtc\" = {now} WHERE \"Id\" = {grant.Id}");
        }
        await using (var db = database.CreateDbContext())
        {
            Assert.Null(await NewStore(db).ApplyFirstMistakeAsync(
                "player-a", grant.Id, now));
        }
        await using var verify = database.CreateDbContext();
        Assert.Equal(20, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Empty(await verify.PortalMistakeDamages.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task DatabaseAuditFailure_RollsBackHpAndReceipt()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a", Slot = "relic",
                GrantId = Guid.NewGuid(), EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                NewStore(db).ApplyFirstMistakeAsync(
                    "player-a", grant.Id, DateTimeOffset.UtcNow));
        }
        await using var check = database.CreateDbContext();
        Assert.Empty(await check.PortalMistakeDamages.ToListAsync());
        Assert.Equal(20, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Empty((await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task AtZeroHealth_MistakeDoesNotDriveHpNegative()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE player_characters SET \"CurrentHealth\" = {0} WHERE \"OwnerId\" = {"player-a"}");
        }
        await using (var db = database.CreateDbContext())
        {
            var result = await NewStore(db).ApplyFirstMistakeAsync(
                "player-a", grant.Id, DateTimeOffset.UtcNow);
            Assert.NotNull(result);
            Assert.Equal(0, result.Damage);
            Assert.Equal(0, result.CurrentHealth);
        }
        await using var verify = database.CreateDbContext();
        Assert.Equal(0, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
    }

    private static PortalMistakeDamageRepository NewStore(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static async Task<ExclusiveContentGrant> SeedAsync(PostgresDatabaseScope database)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.grove",
            PortalSequenceRules.PortalKey, "dialog.grove", "reward.reference",
            4242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await new PlayerCharacterRepository(db).AddAsync(
            PlayerCharacter.Create("player-a", "Portal Vuxian",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance("hair-1", "black", "face-1",
                    "body-1", "skin-1", "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();
        return grant;
    }
}
