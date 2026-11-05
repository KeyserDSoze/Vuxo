using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalGuardianPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task GuardianShowdown_PersistsCanonicalHpAndCausalPrivateAudit_WithReplay()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        var key = Guid.NewGuid();
        await using (var db = database.CreateDbContext())
        {
            var status = await Guardian(db).GetAsync("player-a", grant.Id, now);
            Assert.NotNull(status);
            Assert.Equal(6, status.GuardianMaxHealth);
            Assert.Equal(6, status.GuardianHealth);
            Assert.Equal(0, status.Turn);
            Assert.Equal(20, status.PlayerHealth);

            var turn = await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, key, now);
            Assert.False(turn.Replayed);
            Assert.Equal(1, turn.Turn);
            Assert.Equal(1, turn.DamageDealt);
            Assert.Equal(0, turn.DamageTaken);
            Assert.Equal(5, turn.GuardianHealth);
            Assert.Equal(20, turn.PlayerHealth);
        }
        await using (var db = database.CreateDbContext())
        {
            var replay = await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, key, now.AddMinutes(5));
            Assert.True(replay.Replayed);
            Assert.Equal(5, replay.GuardianHealth);
        }
        await using var check = database.CreateDbContext();
        var receipt = Assert.Single(await check.PortalGuardianTurns.ToListAsync());
        Assert.Equal(0, receipt.DamageTaken);
        Assert.Equal(1, receipt.DamageDealt);
        Assert.Equal(1, (await check.PortalEncounterStates.SingleAsync()).GuardianTurn);
        Assert.Equal(20, (await check.PlayerCharacters.SingleAsync()).CurrentHealth);
        var events = (await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items;
        Assert.Equal(2, events.Count);
        var started = Assert.Single(events, x =>
            x.Envelope.EventType == "portal.encounter_started");
        var resolved = Assert.Single(events, x =>
            x.Envelope.EventType == "portal.guardian_turn_resolved");
        Assert.Equal(GameEventVisibilityScope.Player, resolved.Envelope.VisibilityScope);
        Assert.Equal(PortalGuardianRules.Version, resolved.Envelope.RuleVersion);
        Assert.Equal(started.Envelope.EventId, resolved.Envelope.CausationId);
        Assert.Equal(grant.CorrelationId, resolved.Envelope.CorrelationId);
    }


    [PostgresIntegrationFact]
    public async Task History_IsChronologicalOwnerOnlyAndScopedToCurrentEncounter()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);

        await using (var db = database.CreateDbContext())
        {
            var empty = await Guardian(db).GetHistoryAsync("player-a", grant.Id, now);
            Assert.NotNull(empty);
            Assert.Empty(empty);
        }

        for (var turn = 0; turn < 2; turn++)
        {
            await using var db = database.CreateDbContext();
            await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, turn, Guid.NewGuid(), now);
        }

        await using (var db = database.CreateDbContext())
        {
            var history = await Guardian(db).GetHistoryAsync("player-a", grant.Id, now);
            Assert.NotNull(history);
            Assert.Equal(new[] { 1, 2 }, history.Select(row => row.Turn));
            Assert.Equal(new[] { 5, 3 }, history.Select(row => row.GuardianHealth));
            Assert.Equal(18, history[1].PlayerHealth);
            Assert.All(history, row => Assert.Equal(PortalGuardianRules.Strike, row.Action));

            Assert.Null(await Guardian(db).GetHistoryAsync("another-player", grant.Id, now));
            Assert.Null(await Guardian(db).GetHistoryAsync("player-a", grant.Id,
                now.Add(PortalEncounterRules.MaximumDuration)));
        }

        // The same grant may open another verified encounter after the lease expires.
        // Historical rows remain immutable but must never appear in that new visit.
        var nextVisit = now.Add(PortalEncounterRules.MaximumDuration).AddSeconds(1);
        await StartAsync(database, grant.Id, nextVisit);
        await using (var db = database.CreateDbContext())
        {
            var newHistory = await Guardian(db).GetHistoryAsync("player-a", grant.Id, nextVisit);
            Assert.NotNull(newHistory);
            Assert.Empty(newHistory);
            await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Guard, 0, Guid.NewGuid(), nextVisit);
        }
        await using var verify = database.CreateDbContext();
        var latest = await Guardian(verify).GetHistoryAsync("player-a", grant.Id, nextVisit);
        Assert.NotNull(latest);
        var only = Assert.Single(latest);
        Assert.Equal(1, only.Turn);
        Assert.Equal(PortalGuardianRules.Guard, only.Action);
        Assert.Equal(3, await verify.PortalGuardianTurns.CountAsync());
    }

    [PostgresIntegrationFact]
    public async Task ConcurrentTurns_AreSerializedAndReplaySafeAcrossNodes()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        var key = Guid.NewGuid();
        async Task<PortalGuardianTurnResult> Play(Guid id)
        {
            await using var db = database.CreateDbContext();
            return await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, id, now);
        }
        var same = await Task.WhenAll(Play(key), Play(key));
        Assert.Single(same, x => x.Replayed);
        Assert.Equal(same[0].GuardianHealth, same[1].GuardianHealth);
        await using var verify = database.CreateDbContext();
        Assert.Single(await verify.PortalGuardianTurns.ToListAsync());
        var reused = await Assert.ThrowsAsync<PortalGuardianException>(() =>
            Guardian(verify).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Guard, 0, key, now));
        Assert.Equal(PortalGuardianErrorCodes.KeyReused, reused.Code);
        var stale = await Assert.ThrowsAsync<PortalGuardianException>(() =>
            Guardian(verify).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, Guid.NewGuid(), now));
        Assert.Equal(PortalGuardianErrorCodes.StaleTurn, stale.Code);
        Assert.Single(await verify.PortalGuardianTurns.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task Victory_EndsShowdownButDoesNotIssueOrConsumePortalReward()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        PortalGuardianTurnResult? last = null;
        for (var turn = 0; turn < 4; turn++)
        {
            await using var db = database.CreateDbContext();
            last = await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, turn, Guid.NewGuid(), now);
        }
        Assert.NotNull(last);
        Assert.Equal(PortalGuardianRules.Victory, last.Outcome);
        Assert.Equal(0, last.GuardianHealth);
        await using var verify = database.CreateDbContext();
        Assert.Null((await verify.ExclusiveContentGrants.SingleAsync()).ConsumedAtUtc);
        Assert.Empty(await verify.PlayerInventoryAwards.ToArrayAsync());
        Assert.Equal(4, await verify.PortalGuardianTurns.CountAsync());
        var finished = await Assert.ThrowsAsync<PortalGuardianException>(() =>
            Guardian(verify).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 4, Guid.NewGuid(), now));
        Assert.Equal(PortalGuardianErrorCodes.Finished, finished.Code);
    }

    [PostgresIntegrationFact]
    public async Task ActiveShowdown_DamageBlockedRestAndSurvivesStatusReconnect()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        await using (var db = database.CreateDbContext())
            await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, Guid.NewGuid(), now);
        await using (var db = database.CreateDbContext())
            await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 1, Guid.NewGuid(), now);
        await using (var db = database.CreateDbContext())
        {
            var status = await Guardian(db).GetAsync("player-a", grant.Id, now);
            Assert.NotNull(status);
            Assert.Equal(2, status.Turn);
            Assert.Equal(3, status.GuardianHealth);
            Assert.Equal(18, status.PlayerHealth);
            var rest = await Assert.ThrowsAsync<CharacterRestException>(() =>
                new CharacterRestRepository(db, new GameEventStore(db)).RestAsync(
                    "player-a", Guid.NewGuid(), now));
            Assert.Equal(CharacterRestErrorCodes.EncounterActive, rest.Code);
        }
        await using var verify = database.CreateDbContext();
        Assert.Equal(18, (await verify.PlayerCharacters.SingleAsync()).CurrentHealth);
        Assert.Empty(await verify.CharacterRestActions.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task WrongOwnerAndExpiredLease_CannotPlayOrRead()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        await using var db = database.CreateDbContext();
        Assert.Null(await Guardian(db).GetAsync("other-player", grant.Id, now));
        var denied = await Assert.ThrowsAsync<PortalGuardianException>(() =>
            Guardian(db).PlayAsync("other-player", grant.Id,
                PortalGuardianRules.Strike, 0, Guid.NewGuid(), now));
        Assert.Equal(PortalGuardianErrorCodes.Unavailable, denied.Code);
        Assert.Null(await Guardian(db).GetAsync("player-a", grant.Id, now.AddMinutes(3)));
        var expired = await Assert.ThrowsAsync<PortalGuardianException>(() =>
            Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, Guid.NewGuid(), now.AddMinutes(3)));
        Assert.Equal(PortalGuardianErrorCodes.Unavailable, expired.Code);
    }

    [PostgresIntegrationFact]
    public async Task AuditFailure_RollsBackHealthGuardianTurnAndReceipt()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        await using (var db = database.CreateDbContext())
        {
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a", GrantId = Guid.NewGuid(), Slot = "relic",
                EquippedAtUtc = now
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                Guardian(db).PlayAsync("player-a", grant.Id,
                    PortalGuardianRules.Strike, 0, Guid.NewGuid(), now));
        }
        await using var check = database.CreateDbContext();
        Assert.Empty(await check.PortalGuardianTurns.ToArrayAsync());
        var state = await check.PortalEncounterStates.SingleAsync();
        Assert.Equal(0, state.GuardianTurn);
        Assert.Equal(6, state.GuardianHealth);
        Assert.Equal(20, (await check.PlayerCharacters.SingleAsync()).CurrentHealth);
        var audit = (await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items;
        Assert.Single(audit); // the initial encounter is still traceable
    }

    [PostgresIntegrationFact]
    public async Task OneHpCannotBeginShowdown_AndRetreatStopsAtOne()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await StartAsync(database, grant.Id, now);
        await using (var db = database.CreateDbContext())
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE player_characters SET \"CurrentHealth\" = {2} WHERE \"OwnerId\" = {"player-a"}");
            var first = await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 0, Guid.NewGuid(), now);
            Assert.Equal(2, first.PlayerHealth);
        }
        await using (var db = database.CreateDbContext())
        {
            var second = await Guardian(db).PlayAsync("player-a", grant.Id,
                PortalGuardianRules.Strike, 1, Guid.NewGuid(), now);
            Assert.Equal(1, second.PlayerHealth);
            Assert.Equal(PortalGuardianRules.Retreat, second.Outcome);
        }
        await using (var db = database.CreateDbContext())
        {
            var invalid = await Assert.ThrowsAsync<PortalGuardianException>(() =>
                Guardian(db).PlayAsync("player-a", grant.Id,
                    PortalGuardianRules.Strike, 2, Guid.NewGuid(), now));
            Assert.Equal(PortalGuardianErrorCodes.Finished, invalid.Code);
        }
        await using var verify = database.CreateDbContext();
        Assert.Equal(1, (await verify.PlayerCharacters.SingleAsync()).CurrentHealth);
    }

    private static PortalGuardianRepository Guardian(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static async Task StartAsync(PostgresDatabaseScope database, Guid grantId,
        DateTimeOffset now)
    {
        await using var db = database.CreateDbContext();
        await new PortalEncounterRepository(db, new GameEventStore(db))
            .StartVerifiedPortalAsync("player-a", grantId, now);
    }

    private static async Task<ExclusiveContentGrant> SeedAsync(PostgresDatabaseScope database)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.guardian",
            PortalSequenceRules.PortalKey, "dialog.guardian", "reward.reference",
            4242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await new PlayerCharacterRepository(db).AddAsync(
            PlayerCharacter.Create("player-a", "Guardian Vuxian",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance("hair-1", "black", "face-1",
                    "body-1", "skin-1", "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();
        return grant;
    }
}
