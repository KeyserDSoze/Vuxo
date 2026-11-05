using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalEncounterPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task VerifiedPortalStartsOnce_BlocksRestAndHealingAndKeepsAuditPrivate()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            var store = Encounter(db);
            var first = await store.StartVerifiedPortalAsync("player-a", grant.Id, now);
            Assert.True(first.Active);
            Assert.Equal(grant.Id, first.PortalGrantId);
            Assert.Equal(now.AddMinutes(3), first.ExpiresAtUtc);
            var replay = await store.StartVerifiedPortalAsync("player-a",
                grant.Id, now.AddSeconds(30));
            Assert.True(replay.Active);
            Assert.Equal(first.ExpiresAtUtc, replay.ExpiresAtUtc);
        }

        await using (var db = database.CreateDbContext())
        {
            var rest = await Assert.ThrowsAsync<CharacterRestException>(() =>
                Rest(db).RestAsync("player-a", Guid.NewGuid(), now.AddSeconds(40)));
            Assert.Equal(CharacterRestErrorCodes.EncounterActive, rest.Code);
        }

        await using (var db = database.CreateDbContext())
        {
            var healing = await Assert.ThrowsAsync<CharacterHealingException>(() =>
                Healing(db).HealAsync("player-a", Guid.NewGuid(),
                    Guid.NewGuid(), now.AddSeconds(40)));
            Assert.Equal(CharacterHealingErrorCodes.EncounterActive, healing.Code);
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(7, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Empty(await verify.CharacterRestActions.ToArrayAsync());
        Assert.Empty(await verify.CharacterItemHeals.ToArrayAsync());
        var state = Assert.Single(await verify.PortalEncounterStates.ToArrayAsync());
        Assert.Equal(grant.Id, state.PortalGrantId);
        var audit = Assert.Single((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
        Assert.Equal("portal.encounter_started", audit.Envelope.EventType);
        Assert.Equal(PortalEncounterRules.Version, audit.Envelope.RuleVersion);
        Assert.Equal(GameEventVisibilityScope.Player, audit.Envelope.VisibilityScope);
        Assert.Equal(grant.GrantEventId, audit.Envelope.CausationId);
        Assert.Equal(grant.CorrelationId, audit.Envelope.CorrelationId);
    }

    [PostgresIntegrationFact]
    public async Task CompletionAndExpiration_EndTheLockForNormalRest()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
            await Encounter(db).StartVerifiedPortalAsync("player-a", grant.Id, now);

        await using (var db = database.CreateDbContext())
        {
            var status = await Encounter(db).GetStatusAsync("player-a", now.AddMinutes(3));
            Assert.False(status.Active);
            var result = await Rest(db).RestAsync(
                "player-a", Guid.NewGuid(), now.AddMinutes(3));
            Assert.Equal(12, result.CurrentHealth);
        }
        // A consumed portal also immediately releases its lease (even before TTL).
        await using (var db = database.CreateDbContext())
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE exclusive_content_grants SET \"ConsumedAtUtc\" = {now} WHERE \"Id\" = {grant.Id}");
            Assert.False((await Encounter(db).GetStatusAsync("player-a",
                now.AddMinutes(1))).Active);
        }
    }

    [PostgresIntegrationFact]
    public async Task ConsumedPortalUnlocksRestBeforeDeadline()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
            await Encounter(db).StartVerifiedPortalAsync("player-a", grant.Id, now);
        await using (var db = database.CreateDbContext())
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE exclusive_content_grants SET \"ConsumedAtUtc\" = {now.AddSeconds(5)} WHERE \"Id\" = {grant.Id}");
        await using var verify = database.CreateDbContext();
        Assert.False((await Encounter(verify).GetStatusAsync("player-a",
            now.AddSeconds(10))).Active);
        var rest = await Rest(verify).RestAsync("player-a", Guid.NewGuid(),
            now.AddSeconds(10));
        Assert.Equal(12, rest.CurrentHealth);
    }

    [PostgresIntegrationFact]
    public async Task TwoNodesSamePortalEntry_IsIdempotent_AndDifferentPortalConflicts()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var first = await SeedAsync(database);
        var second = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "other.portal",
            PortalSequenceRules.PortalKey, "dialog.2", "reward.other",
            500L, "personal-content-v1", Guid.NewGuid(), null,
            DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        await using (var setup = database.CreateDbContext())
        {
            await new ExclusiveContentGrantRepository(setup).AddAsync(second);
            await setup.SaveChangesAsync();
        }

        async Task<PortalEncounterStatus> StartAsync(Guid grantId)
        {
            await using var db = database.CreateDbContext();
            return await Encounter(db).StartVerifiedPortalAsync(
                "player-a", grantId, DateTimeOffset.UtcNow);
        }
        var rejoined = await Task.WhenAll(StartAsync(first.Id), StartAsync(first.Id));
        Assert.All(rejoined, x => Assert.True(x.Active));
        await using (var db = database.CreateDbContext())
        {
            var conflict = await Assert.ThrowsAsync<PortalEncounterException>(() =>
                Encounter(db).StartVerifiedPortalAsync(
                    "player-a", second.Id, DateTimeOffset.UtcNow));
            Assert.Equal(PortalEncounterErrorCodes.AlreadyActive, conflict.Code);
        }
        await using var verify = database.CreateDbContext();
        Assert.Single(await verify.PortalEncounterStates.ToArrayAsync());
        Assert.Single((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task ConcurrentRestAndEncounterEntry_AreSerializedByTheCharacterLock()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;

        async Task<bool> TryRestAsync()
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Rest(db).RestAsync("player-a", Guid.NewGuid(), now);
                return true;
            }
            catch (CharacterRestException ex) when (
                ex.Code == CharacterRestErrorCodes.EncounterActive)
            {
                return false;
            }
        }
        async Task StartAsync()
        {
            await using var db = database.CreateDbContext();
            await Encounter(db).StartVerifiedPortalAsync("player-a", grant.Id, now);
        }
        var results = await Task.WhenAll(
            Task.Run(TryRestAsync), Task.Run(async () =>
            {
                await StartAsync();
                return false;
            }));
        await using var verify = database.CreateDbContext();
        var restRows = await verify.CharacterRestActions.CountAsync();
        Assert.Equal(results[0] ? 1 : 0, restRows);
        Assert.Equal(results[0] ? 12 : 7, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.True((await Encounter(verify).GetStatusAsync("player-a", now)).Active);
    }

    [PostgresIntegrationFact]
    public async Task ForeignOrExpiredGrant_CannotStartEncounter()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            var wrong = await Assert.ThrowsAsync<PortalEncounterException>(() =>
                Encounter(db).StartVerifiedPortalAsync(
                    "another-player", grant.Id, DateTimeOffset.UtcNow));
            Assert.Equal(PortalEncounterErrorCodes.CharacterRequired, wrong.Code);
        }
        await using (var db = database.CreateDbContext())
        {
            var expired = await Assert.ThrowsAsync<PortalEncounterException>(() =>
                Encounter(db).StartVerifiedPortalAsync(
                    "player-a", grant.Id, DateTimeOffset.UtcNow.AddDays(1)));
            Assert.Equal(PortalEncounterErrorCodes.InvalidPortal, expired.Code);
        }
        await using var verify = database.CreateDbContext();
        Assert.Empty(await verify.PortalEncounterStates.ToArrayAsync());
    }

    [PostgresIntegrationFact]
    public async Task AuditFailure_RollsBackEncounterAndDoesNotBlockHealing()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a",
                GrantId = Guid.NewGuid(), Slot = "relic",
                EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                Encounter(db).StartVerifiedPortalAsync(
                    "player-a", grant.Id, DateTimeOffset.UtcNow));
        }
        await using var verify = database.CreateDbContext();
        Assert.Empty(await verify.PortalEncounterStates.ToArrayAsync());
        Assert.Empty((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
        var rest = await Rest(verify).RestAsync("player-a", Guid.NewGuid(),
            DateTimeOffset.UtcNow);
        Assert.Equal(12, rest.CurrentHealth);
    }

    private static PortalEncounterRepository Encounter(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static CharacterRestRepository Rest(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static CharacterHealingRepository Healing(VuxoDbContext db) =>
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
            PlayerCharacter.Create("player-a", "Encounter Vuxian",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance("hair-1", "black", "face-1",
                    "body-1", "skin-1", "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE player_characters SET \"CurrentHealth\" = {7} WHERE \"OwnerId\" = {"player-a"}");
        return grant;
    }
}
