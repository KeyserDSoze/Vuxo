using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Activities;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class OffworldRunPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task Run_StartCompleteAndReplay_AreAtomicAuditedAndOwnerOnly()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = new DateTimeOffset(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
        var startKey = Guid.NewGuid();
        Guid runId;
        int puzzleIndex;
        await using (var db = database.CreateDbContext())
        {
            var start = await Repository(db).StartAsync("player-a", startKey, now);
            Assert.False(start.Replayed);
            Assert.Equal(OffworldRunRules.Active, start.State);
            Assert.Equal(RunePathPracticeRules.Version, start.RulesVersion);
            Assert.Equal(now.AddMinutes(5), start.ExpiresAtUtc);
            runId = start.RunId;
            puzzleIndex = start.PuzzleIndex;
            Assert.Null(await Repository(db).GetAsync("player-b", runId, now));
        }

        var proof = Solve(puzzleIndex);
        var finishKey = Guid.NewGuid();
        await using (var db = database.CreateDbContext())
        {
            var replayStart = await Repository(db).StartAsync("player-a", startKey,
                now.AddDays(2));
            Assert.True(replayStart.Replayed);
            Assert.Equal(runId, replayStart.RunId);
            var invalid = await Assert.ThrowsAsync<OffworldRunException>(() =>
                Repository(db).CompleteAsync("player-a", runId, finishKey, "UUUU", now));
            Assert.Equal(OffworldRunErrorCodes.InvalidPath, invalid.Code);
            Assert.Equal(OffworldRunRules.Active,
                (await Repository(db).GetAsync("player-a", runId, now))!.State);
        }

        await using (var db = database.CreateDbContext())
        {
            var result = await Repository(db).CompleteAsync("player-a", runId,
                finishKey, proof, now.AddSeconds(30));
            Assert.Equal(OffworldRunRules.Completed, result.State);
            Assert.Equal(proof.Length, result.StepsChecked);
            Assert.False(result.Replayed);
            var replay = await Repository(db).CompleteAsync("player-a", runId,
                finishKey, proof, now.AddDays(4));
            Assert.True(replay.Replayed);
            var misuse = await Assert.ThrowsAsync<OffworldRunException>(() =>
                Repository(db).CompleteAsync("player-a", runId,
                    finishKey, proof + "L", now.AddSeconds(30)));
            Assert.Equal(OffworldRunErrorCodes.KeyReused, misuse.Code);
        }

        await using var verify = database.CreateDbContext();
        var stored = Assert.Single(await verify.OffworldActivityRuns.ToListAsync());
        Assert.Equal("player-a", stored.PlayerId);
        Assert.Equal(startKey, stored.StartKey);
        Assert.Equal(finishKey, stored.FinishKey);
        Assert.Equal(OffworldRunRules.Completed, stored.State);
        Assert.Equal(puzzleIndex, stored.PuzzleIndex);
        Assert.Equal(proof.Length, stored.StepsChecked);
        var history = (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items;
        Assert.Equal(2, history.Count);
        var opened = Assert.Single(history, x => x.Envelope.EventType == "activity.run_started");
        var completed = Assert.Single(history, x => x.Envelope.EventType == "activity.run_completed");
        Assert.Equal(GameEventVisibilityScope.Player, opened.Envelope.VisibilityScope);
        Assert.Equal(GameEventVisibilityScope.Player, completed.Envelope.VisibilityScope);
        Assert.Equal(stored.StartEventId, completed.Envelope.CausationId);
        Assert.Equal(runId, completed.Envelope.CorrelationId);
    }

    [PostgresIntegrationFact]
    public async Task ConcurrentStarts_OnlyOneTicketIsActive_AcrossDbContexts()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        async Task<(bool Success, string? Error)> TryStart(Guid key)
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Repository(db).StartAsync("player-a", key, now);
                return (true, null);
            }
            catch (OffworldRunException e) { return (false, e.Code); }
        }

        var results = await Task.WhenAll(TryStart(Guid.NewGuid()), TryStart(Guid.NewGuid()));
        Assert.Single(results, x => x.Success);
        Assert.Single(results, x => x.Error == OffworldRunErrorCodes.AlreadyActive);
        await using var check = database.CreateDbContext();
        Assert.Single(await check.OffworldActivityRuns.ToListAsync());
        Assert.Single((await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task ExpiredRun_DoesNotComplete_AndNextStartMarksExpiredWithAudit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        Guid firstId;
        await using (var db = database.CreateDbContext())
        {
            firstId = (await Repository(db).StartAsync("player-a", Guid.NewGuid(), now)).RunId;
            Assert.Equal(OffworldRunRules.Expired,
                (await Repository(db).GetAsync("player-a", firstId,
                    now.Add(OffworldRunRules.Lifetime)))!.State);
        }

        await using (var db = database.CreateDbContext())
        {
            var error = await Assert.ThrowsAsync<OffworldRunException>(() =>
                Repository(db).CompleteAsync("player-a", firstId, Guid.NewGuid(),
                    "DDDRRR", now.AddMinutes(6)));
            Assert.Equal(OffworldRunErrorCodes.Expired, error.Code);
            var next = await Repository(db).StartAsync("player-a", Guid.NewGuid(),
                now.AddMinutes(6));
            Assert.NotEqual(firstId, next.RunId);
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(OffworldRunRules.Expired,
            (await verify.OffworldActivityRuns.SingleAsync(x => x.Id == firstId)).State);
        var events = (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items;
        Assert.Equal(3, events.Count);
        Assert.Single(events, x => x.Envelope.EventType == "activity.run_expired");
    }

    [PostgresIntegrationFact]
    public async Task CooldownAndOwnerMismatch_NeverCreateSecondReceipt()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        Guid firstId;
        await using (var db = database.CreateDbContext())
        {
            var first = await Repository(db).StartAsync("player-a", Guid.NewGuid(), now);
            firstId = first.RunId;
            var notMine = await Assert.ThrowsAsync<OffworldRunException>(() =>
                Repository(db).CompleteAsync("player-b", firstId, Guid.NewGuid(),
                    Solve(first.PuzzleIndex), now));
            Assert.Equal(OffworldRunErrorCodes.NotFound, notMine.Code);
            await Repository(db).CompleteAsync("player-a", firstId,
                Guid.NewGuid(), Solve(first.PuzzleIndex), now.AddSeconds(1));
        }
        await using (var db = database.CreateDbContext())
        {
            var error = await Assert.ThrowsAsync<OffworldRunException>(() =>
                Repository(db).StartAsync("player-a", Guid.NewGuid(), now.AddMinutes(1)));
            Assert.Equal(OffworldRunErrorCodes.Cooldown, error.Code);
            Assert.Equal(now.AddMinutes(2), error.NextAllowedAtUtc);
        }
        await using var check = database.CreateDbContext();
        Assert.Single(await check.OffworldActivityRuns.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task FailedSave_RollsBackAuditAndRunCreation()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a",
                Slot = "relic",
                GrantId = Guid.NewGuid(),
                EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                Repository(db).StartAsync("player-a", Guid.NewGuid(),
                    DateTimeOffset.UtcNow));
        }

        await using var check = database.CreateDbContext();
        Assert.Empty(await check.OffworldActivityRuns.ToListAsync());
        Assert.Empty((await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    private static OffworldRunRepository Repository(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static string Solve(int puzzle) => puzzle switch
    {
        0 => "DDDRRR",
        1 => "RRRDDD",
        2 => "DDRRDR",
        _ => throw new ArgumentOutOfRangeException(nameof(puzzle))
    };

    private static async Task SeedAsync(PostgresDatabaseScope database)
    {
        var character = PlayerCharacter.Create(
            "player-a", "Activity Vuxian",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "shorts", "black", "shoe-1", "white"));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new PlayerCharacterRepository(db).AddAsync(character);
        await db.SaveChangesAsync();
    }
}
