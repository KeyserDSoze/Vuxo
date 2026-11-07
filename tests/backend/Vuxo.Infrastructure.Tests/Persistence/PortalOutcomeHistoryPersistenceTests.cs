using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalOutcomeHistoryPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task FirstMistakeAndSolvedSequence_AreDistinctVerifiedEventsWithoutCrossOwnerLeak()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;

        await using (var db = database.CreateDbContext())
        {
            var service = new PortalMistakeDamageRepository(db, new GameEventStore(db));
            var damage = await service.ApplyFirstMistakeAsync("player-a", grant.Id, now);
            Assert.NotNull(damage);
            Assert.True(damage.Applied);
        }

        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var answer = (await service.GetChallengeAsync("player-a", grant.Id)).Sequence;
            await service.SubmitChallengeAsync("player-a", grant.Id, answer);
        }

        await using var verification = database.CreateDbContext();
        var reader = new PortalOutcomeHistoryReader(verification);
        var page = await reader.ListForPlayerAsync("player-a", 1, 20);
        var events = page.Items;
        Assert.Equal(2, events.Count);
        Assert.Contains(events, x => x.Kind == PortalOutcomeKinds.SequenceFirstMistake);
        Assert.Contains(events, x => x.Kind == PortalOutcomeKinds.SequenceCompleted);
        Assert.All(events, x => Assert.Equal(grant.Id, x.GrantId));
        Assert.All(events, x => Assert.Equal("portal.grove", x.ContentKey));
        Assert.Equal(2, events.Select(x => x.EventId).Distinct().Count());
        Assert.False(page.HasMore);

        var firstPage = await reader.ListForPlayerAsync("player-a", 1, 1);
        var secondPage = await reader.ListForPlayerAsync("player-a", 2, 1);
        Assert.True(firstPage.HasMore);
        Assert.False(secondPage.HasMore);
        Assert.NotEqual(firstPage.Items[0].EventId, secondPage.Items[0].EventId);
        Assert.Empty((await reader.ListForPlayerAsync("player-b", 1, 20)).Items);

        // Receipt is grant-unique: replay cannot generate another first mistake.
        await using var repeatDb = database.CreateDbContext();
        var replay = await new PortalMistakeDamageRepository(repeatDb, new GameEventStore(repeatDb))
            .ApplyFirstMistakeAsync("player-a", grant.Id, now);
        Assert.Null(replay); // grant already consumed, no new receipt

        // An audit with matching EventId/CausationId must still share the
        // original grant correlation and canonical mistake rule version.
        var mistakeEvent = await verification.GameEvents.AsNoTracking()
            .SingleAsync(x => x.EventType == "portal.sequence_mistake_damage");
        await verification.GameEvents
            .Where(x => x.EventId == mistakeEvent.EventId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.CorrelationId, Guid.NewGuid()));
        var noForgedMistake = await reader.ListForPlayerAsync("player-a", 1, 20);
        Assert.Equal(PortalOutcomeKinds.SequenceCompleted,
            Assert.Single(noForgedMistake.Items).Kind);

        await verification.GameEvents
            .Where(x => x.EventId == mistakeEvent.EventId)
            .ExecuteUpdateAsync(update => update
                .SetProperty(x => x.CorrelationId, grant.CorrelationId)
                .SetProperty(x => x.RuleVersion, "forged-mistake-rules"));
        Assert.Equal(PortalOutcomeKinds.SequenceCompleted, Assert.Single(
            (await reader.ListForPlayerAsync("player-a", 1, 20)).Items).Kind);
        Assert.Empty((await reader.ListForPlayerAsync("player-b", 1, 20)).Items);
    }

    [PostgresIntegrationFact]
    public async Task TerminalGuardianTurns_AreReportedOnlyOnceAfterVerifiedCombat()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            await new PortalEncounterRepository(db, new GameEventStore(db))
                .StartVerifiedPortalAsync("player-a", grant.Id, now);
        }

        string outcome = PortalGuardianRules.Ongoing;
        for (var turn = 0; turn < PortalGuardianRules.MaximumTurns && outcome == PortalGuardianRules.Ongoing; turn++)
        {
            await using var db = database.CreateDbContext();
            var receipt = await new PortalGuardianRepository(db, new GameEventStore(db))
                .PlayAsync("player-a", grant.Id,
                    PortalGuardianRules.Strike, turn, Guid.NewGuid(), now);
            outcome = receipt.Outcome;
        }

        Assert.Contains(outcome, new[] { PortalGuardianRules.Victory, PortalGuardianRules.Retreat });
        await using var verify = database.CreateDbContext();
        var history = new PortalOutcomeHistoryReader(verify);
        var result = await history.ListForPlayerAsync("player-a", 1, 20);
        var terminal = Assert.Single(result.Items);
        Assert.Equal(grant.Id, terminal.GrantId);
        Assert.Equal(
            outcome == PortalGuardianRules.Victory
                ? PortalOutcomeKinds.GuardianVictory : PortalOutcomeKinds.GuardianRetreat,
            terminal.Kind);
        Assert.Equal(PortalGuardianRules.CurrentVersion, terminal.RuleVersion);
        Assert.Empty((await history.ListForPlayerAsync("player-b", 1, 20)).Items);

        var encounterStartId = await verify.PortalGuardianTurns.AsNoTracking()
            .Select(x => x.EncounterEventId).Distinct().SingleAsync();

        // A turn alone cannot prove a terminal outcome if its encounter-start
        // event is no longer causally tied to this portal grant.
        await verify.GameEvents
            .Where(x => x.EventId == encounterStartId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.CausationId, (Guid?)Guid.NewGuid()));
        Assert.Empty((await history.ListForPlayerAsync("player-a", 1, 20)).Items);

        // Even the correct encounter start must have the owner correlation.
        await verify.GameEvents
            .Where(x => x.EventId == encounterStartId)
            .ExecuteUpdateAsync(update => update
                .SetProperty(x => x.CausationId, (Guid?)grant.GrantEventId)
                .SetProperty(x => x.CorrelationId, Guid.NewGuid()));
        Assert.Empty((await history.ListForPlayerAsync("player-a", 1, 20)).Items);

        // A forged terminal-turn correlation must likewise be excluded.
        await verify.GameEvents
            .Where(x => x.EventId == encounterStartId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.CorrelationId, grant.CorrelationId));
        await verify.GameEvents
            .Where(x => x.EventId == terminal.EventId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.CorrelationId, Guid.NewGuid()));
        Assert.Empty((await history.ListForPlayerAsync("player-a", 1, 20)).Items);
    }


    [PostgresIntegrationFact]
    public async Task CursorOutcomes_AuditUnionRemainsStableAcrossNewHeadInsert()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow.AddTicks(-(DateTimeOffset.UtcNow.Ticks % 10));

        await using (var db = database.CreateDbContext())
        {
            var damage = await new PortalMistakeDamageRepository(db, new GameEventStore(db))
                .ApplyFirstMistakeAsync("player-a", grant.Id, now);
            Assert.NotNull(damage);
        }
        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var answer = (await service.GetChallengeAsync("player-a", grant.Id)).Sequence;
            await service.SubmitChallengeAsync("player-a", grant.Id, answer);
        }
        await using (var assign = database.CreateDbContext())
        {
            await assign.GameEvents.Where(x => x.EventType == "portal.sequence_mistake_damage"
                && x.CausationId == grant.GrantEventId)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.OccurredAtUtc,
                    now.AddMinutes(1)));
            await assign.GameEvents.Where(x => x.EventType == "exclusive_content.consumed"
                && x.CausationId == grant.GrantEventId)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.OccurredAtUtc,
                    now.AddMinutes(2)));
        }

        await using var check = database.CreateDbContext();
        var history = new PortalOutcomeHistoryReader(check);
        var first = await history.ListForPlayerAsync("player-a", 1, 1);
        Assert.Equal(PortalOutcomeKinds.SequenceCompleted, Assert.Single(first.Items).Kind);
        Assert.NotNull(first.NextCursor);

        var nextGrant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.grove",
            PortalSequenceRules.PortalKey, "dialog", "unsupported-reward",
            4242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using (var db = database.CreateDbContext())
        {
            await new ExclusiveContentGrantRepository(db).AddAsync(nextGrant);
            await db.SaveChangesAsync();
        }
        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var answer = (await service.GetChallengeAsync("player-a", nextGrant.Id)).Sequence;
            await service.SubmitChallengeAsync("player-a", nextGrant.Id, answer);
            await db.GameEvents.Where(x => x.EventType == "exclusive_content.consumed"
                && x.CausationId == nextGrant.GrantEventId)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.OccurredAtUtc,
                    now.AddMinutes(3)));
        }

        var second = await history.ListForPlayerAsync("player-a", 2, 1,
            cursor: first.NextCursor);
        Assert.Equal(PortalOutcomeKinds.SequenceFirstMistake, Assert.Single(second.Items).Kind);
        Assert.Equal(grant.Id, second.Items[0].GrantId);
        Assert.False(second.HasMore);
        Assert.Empty((await history.ListForPlayerAsync("player-b", 2, 1,
            cursor: first.NextCursor)).Items);
    }


    [PostgresIntegrationFact]
    public async Task CursorOutcomes_EqualAuditTimestampUsesPublicEventIdAcrossUnionPages()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var instant = DateTimeOffset.UtcNow;
        instant = instant.AddTicks(-(instant.Ticks % 10));

        await using (var db = database.CreateDbContext())
        {
            var result = await new PortalMistakeDamageRepository(db, new GameEventStore(db))
                .ApplyFirstMistakeAsync("player-a", grant.Id, instant);
            Assert.NotNull(result);
        }
        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var answer = (await service.GetChallengeAsync("player-a", grant.Id)).Sequence;
            await service.SubmitChallengeAsync("player-a", grant.Id, answer);
            // Both separate outcome families have the same database timestamp.
            await db.GameEvents.Where(x => x.PlayerId == "player-a"
                && x.CausationId == grant.GrantEventId
                && (x.EventType == "exclusive_content.consumed" ||
                    x.EventType == "portal.sequence_mistake_damage"))
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.OccurredAtUtc, instant));
        }

        await using var verify = database.CreateDbContext();
        var expected = await verify.GameEvents.AsNoTracking()
            .Where(x => x.PlayerId == "player-a" && x.CausationId == grant.GrantEventId
                && (x.EventType == "exclusive_content.consumed" ||
                    x.EventType == "portal.sequence_mistake_damage"))
            .OrderByDescending(x => x.EventId).Select(x => x.EventId).ToArrayAsync();
        Assert.Equal(2, expected.Length);

        var history = new PortalOutcomeHistoryReader(verify);
        var first = await history.ListForPlayerAsync("player-a", 1, 1);
        Assert.NotNull(first.NextCursor);
        var second = await history.ListForPlayerAsync("player-a", 2, 1,
            cursor: first.NextCursor);
        Assert.Equal(expected, first.Items.Concat(second.Items).Select(x => x.EventId));
        Assert.False(second.HasMore);
        Assert.Null(second.NextCursor);
    }

    private static async Task<ExclusiveContentGrant> SeedAsync(PostgresDatabaseScope database)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.grove",
            PortalSequenceRules.PortalKey, "dialog", "unsupported-reward",
            4242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await new PlayerCharacterRepository(db).AddAsync(PlayerCharacter.Create(
            "player-a", "Portal Explorer",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance(
                "hair-1", "black", "face-1", "body-1", "skin-1",
                "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();
        return grant;
    }
}
