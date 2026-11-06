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
    public async Task OwnerActiveDiscovery_ExpiresAtBoundaryAndStopsAfterCompletion()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = new DateTimeOffset(2026, 11, 6, 1, 0, 0, TimeSpan.Zero);
        OffworldRunResult issued;
        await using (var db = database.CreateDbContext())
        {
            Assert.Null(await Repository(db).GetActiveAsync("player-a", now));
            issued = await Repository(db).StartAsync("player-a", Guid.NewGuid(), now);
        }

        // Cross-device query uses another DbContext and returns only owner data.
        await using (var secondDevice = database.CreateDbContext())
        {
            var discovered = await Repository(secondDevice).GetActiveAsync("player-a", now);
            Assert.NotNull(discovered);
            Assert.Equal(issued.RunId, discovered.RunId);
            Assert.Equal(issued.PuzzleIndex, discovered.PuzzleIndex);
            Assert.Equal(OffworldRunRules.Active, discovered.State);
            Assert.Null(await Repository(secondDevice).GetActiveAsync("player-b", now));
            Assert.Null(await Repository(secondDevice).GetActiveAsync(
                "player-a", issued.ExpiresAtUtc));
            Assert.Null(await Repository(secondDevice).GetActiveAsync(
                "player-a", issued.ExpiresAtUtc.AddSeconds(1)));
        }

        await using (var firstDevice = database.CreateDbContext())
        {
            await Repository(firstDevice).CompleteAsync("player-a", issued.RunId,
                Guid.NewGuid(), Solve(issued.PuzzleIndex), now.AddSeconds(20));
        }
        await using (var check = database.CreateDbContext())
        {
            Assert.Null(await Repository(check).GetActiveAsync(
                "player-a", now.AddSeconds(21)));
            Assert.Equal(OffworldRunRules.Completed,
                (await Repository(check).GetAsync("player-a", issued.RunId,
                    now.AddSeconds(21)))!.State);
        }

        // Discovery is side-effect free: start + completion only, no discovery audit.
        await using var verify = database.CreateDbContext();
        Assert.Equal(2, (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items.Count);
    }

    [PostgresIntegrationFact]
    public async Task History_IsOwnerScopedNewestFirstBoundedAndReadOnly()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var clock = new DateTimeOffset(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);
        var firstKey = Guid.NewGuid();
        Guid firstId;
        await using (var db = database.CreateDbContext())
        {
            firstId = (await Repository(db).StartAsync("player-a", firstKey, clock)).RunId;
        }

        // Effective expiry must be visible even before a materializing write.
        await using (var db = database.CreateDbContext())
        {
            var expired = await Repository(db).GetHistoryAsync("player-a", 10,
                clock.AddMinutes(6));
            var first = Assert.Single(expired);
            Assert.Equal(firstId, first.RunId);
            Assert.Equal(OffworldRunRules.Expired, first.State);
            Assert.Null(first.StepsChecked);
            Assert.Empty(await Repository(db).GetHistoryAsync("player-b", 10,
                clock.AddMinutes(6)));
        }
        await using (var check = database.CreateDbContext())
        {
            // A history request must not update the persisted row or audit.
            Assert.Equal(OffworldRunRules.Active,
                (await check.OffworldActivityRuns.SingleAsync()).State);
            Assert.Single((await new GameEventStore(check).QueryAsync(
                new GameEventQuery(PlayerId: "player-a"))).Items);
        }

        Guid secondId;
        await using (var db = database.CreateDbContext())
        {
            var second = await Repository(db).StartAsync("player-a",
                Guid.NewGuid(), clock.AddMinutes(6));
            secondId = second.RunId;
            await Repository(db).CompleteAsync("player-a", secondId,
                Guid.NewGuid(), Solve(second.PuzzleIndex), clock.AddMinutes(6).AddSeconds(15));
        }

        Guid newestId;
        await using (var db = database.CreateDbContext())
        {
            newestId = (await Repository(db).StartAsync("player-a",
                Guid.NewGuid(), clock.AddMinutes(9))).RunId;
        }

        await using (var db = database.CreateDbContext())
        {
            var rows = await Repository(db).GetHistoryAsync("player-a", 10,
                clock.AddMinutes(9).AddSeconds(1));
            Assert.Equal(new[] { newestId, secondId, firstId },
                rows.Select(row => row.RunId).ToArray());
            Assert.Equal(
                new[] { OffworldRunRules.Active, OffworldRunRules.Completed,
                    OffworldRunRules.Expired },
                rows.Select(row => row.State).ToArray());
            Assert.Null(rows[0].StepsChecked);
            Assert.Equal(6, rows[1].StepsChecked);
            Assert.Null(rows[2].CompletedAtUtc);
            var bounded = await Repository(db).GetHistoryAsync("player-a", 1,
                clock.AddMinutes(10));
            Assert.Single(bounded);
            Assert.Equal(newestId, bounded[0].RunId);
            Assert.Empty(await Repository(db).GetHistoryAsync("player-b", 20,
                clock.AddMinutes(10)));
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(3, await verify.OffworldActivityRuns.CountAsync());
        var eventCount = (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a", Limit: 100))).Items.Count;
        // First start + expiry, second start + completion, third start.
        Assert.Equal(5, eventCount);
    }

    [PostgresIntegrationFact]
    public async Task PracticeProgress_IsDerivedFromVerifiedCompletions_WithoutRewardsOrAudit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var start = new DateTimeOffset(2026, 11, 6, 9, 0, 0, TimeSpan.Zero);

        await using (var db = database.CreateDbContext())
        {
            var empty = await Repository(db).GetPracticeProgressAsync("player-a");
            Assert.Equal(0, empty.CompletedRuns);
            Assert.Equal(OffworldPracticeProgressRules.MilestoneNewcomer, empty.Milestone);
            Assert.Empty((await new GameEventStore(db).QueryAsync(
                new GameEventQuery(PlayerId: "player-a"))).Items);
        }

        // Deterministic fixture: persist distinct canonical boards, then
        // complete them using the same normal validator/transaction as gameplay.
        for (var i = 0; i < 5; i++)
        {
            await using var db = database.CreateDbContext();
            var now = start.AddMinutes(i * 3);
            var issued = await Repository(db).StartAsync("player-a", Guid.NewGuid(), now);
            var entity = await db.OffworldActivityRuns.SingleAsync(x => x.Id == issued.RunId);
            var puzzle = i switch { 0 => 0, 1 => 0, 2 => 1, 3 => 2, _ => 2 };
            entity.PuzzleIndex = puzzle;
            await db.SaveChangesAsync();
            await Repository(db).CompleteAsync("player-a", issued.RunId,
                Guid.NewGuid(), Solve(puzzle), now.AddSeconds(20));
            if (i == 4)
            {
                entity.RulesVersion = "rune-path-practice-legacy";
                await db.SaveChangesAsync();
            }
        }

        await using (var anotherDevice = database.CreateDbContext())
        {
            var progress = await Repository(anotherDevice)
                .GetPracticeProgressAsync("player-a");
            Assert.Equal(4, progress.CompletedRuns); // one legacy version omitted
            Assert.Equal(3, progress.BoardsSolved);
            Assert.Equal(OffworldPracticeProgressRules.MilestoneCartographer,
                progress.Milestone);
            Assert.Equal(new[] { 0, 1, 2 }, progress.Boards.Select(x => x.PuzzleIndex));
            Assert.Equal(new[] { 2, 1, 1 }, progress.Boards.Select(x => x.CompletedRuns));
            Assert.All(progress.Boards, x => Assert.Equal(6, x.BestSteps));
            Assert.False(progress.RewardsEnabled);
            Assert.Equal(0, progress.XpGranted);
            Assert.Equal(0, progress.ItemsGranted);
            Assert.Equal(OffworldPracticeProgressRules.RewardBlockReason,
                progress.RewardBlockReason);
            var foreign = await Repository(anotherDevice)
                .GetPracticeProgressAsync("player-b");
            Assert.Equal(0, foreign.CompletedRuns);
            Assert.Empty(foreign.Boards);
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(5, await verify.OffworldActivityRuns.CountAsync());
        Assert.Equal(10, (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a", Limit: 100))).Items.Count);
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
    public async Task ConcurrentFinishIntents_CommitOnlyOneCompletedReceipt()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        OffworldRunResult run;
        await using (var db = database.CreateDbContext())
            run = await Repository(db).StartAsync("player-a", Guid.NewGuid(), now);

        async Task<(bool Success, string? Error)> TryFinish()
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Repository(db).CompleteAsync("player-a", run.RunId,
                    Guid.NewGuid(), Solve(run.PuzzleIndex), now.AddSeconds(1));
                return (true, null);
            }
            catch (OffworldRunException e) { return (false, e.Code); }
        }

        var results = await Task.WhenAll(TryFinish(), TryFinish());
        Assert.Single(results, x => x.Success);
        Assert.Single(results, x => x.Error == OffworldRunErrorCodes.Completed);
        await using var verify = database.CreateDbContext();
        var stored = Assert.Single(await verify.OffworldActivityRuns.ToListAsync());
        Assert.Equal(OffworldRunRules.Completed, stored.State);
        Assert.NotNull(stored.FinishKey);
        var events = (await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items;
        Assert.Single(events, x => x.Envelope.EventType == "activity.run_completed");
        Assert.Equal(2, events.Count);
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
            // PostgreSQL stores timestamps at microsecond precision, while .NET
            // can retain sub-microsecond ticks. Compare the public millisecond boundary.
            Assert.Equal(now.AddMinutes(2).ToUnixTimeMilliseconds(),
                error.NextAllowedAtUtc!.Value.ToUnixTimeMilliseconds());
        }
        await using var check = database.CreateDbContext();
        Assert.Single(await check.OffworldActivityRuns.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task DailyQuota_RejectsThirteenthRunEvenWhenCooldownHasElapsed()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedAsync(database);
        var day = new DateTimeOffset(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
        for (var i = 0; i < OffworldRunRules.MaximumDailyStarts; i++)
        {
            var now = day.AddMinutes(i * 3);
            await using var db = database.CreateDbContext();
            var run = await Repository(db).StartAsync("player-a", Guid.NewGuid(), now);
            await Repository(db).CompleteAsync("player-a", run.RunId,
                Guid.NewGuid(), Solve(run.PuzzleIndex), now.AddSeconds(20));
        }

        await using var check = database.CreateDbContext();
        var error = await Assert.ThrowsAsync<OffworldRunException>(() =>
            Repository(check).StartAsync("player-a", Guid.NewGuid(), day.AddMinutes(40)));
        Assert.Equal(OffworldRunErrorCodes.DailyLimit, error.Code);
        Assert.Equal(OffworldRunRules.MaximumDailyStarts,
            await check.OffworldActivityRuns.CountAsync());
        Assert.Equal(OffworldRunRules.MaximumDailyStarts * 2,
            (await new GameEventStore(check).QueryAsync(
                new GameEventQuery(PlayerId: "player-a", Limit: 100))).Items.Count);
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
