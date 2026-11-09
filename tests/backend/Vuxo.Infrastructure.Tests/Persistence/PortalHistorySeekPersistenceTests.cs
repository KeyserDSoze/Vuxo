using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

/// <summary>
/// Real PostgreSQL seek semantics: UUID comparison must follow database
/// ordering even when audited event timestamps are identical.
/// </summary>
public sealed class PortalHistorySeekPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task CompletedRuneSeek_SkipsNewerInsertedGrant_AndPreservesTiedEvents()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var first = CreateGrant("player-a", now);
        var second = CreateGrant("player-a", now);
        var newcomer = CreateGrant("player-a", now);
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            var grants = new ExclusiveContentGrantRepository(setup);
            foreach (var grant in new[] { first, second, newcomer })
                await grants.AddAsync(grant);
            await setup.SaveChangesAsync();
        }

        foreach (var grant in new[] { first, second })
            await SolveAsync(database, grant);

        // Same microsecond for both events: UUID must provide the seek tie-break.
        await ForceSameAuditTimeAsync(database, now.AddMinutes(-1),
            "exclusive_content.consumed", first.PlayerId);
        await using var verification = database.CreateDbContext();
        var reader = new PortalCompletionHistoryReader(verification);
        var page1 = await reader.ListCompletedForPlayerAsync("player-a", 1, 1);
        var firstItem = Assert.Single(page1.Items);
        Assert.True(page1.HasMore);
        Assert.NotNull(page1.NextCursor);
        Assert.True(PortalHistoryCursor.TryDecode(page1.NextCursor, out var position));
        Assert.NotNull(position);

        // A newer completion appears between requests; offset paging would
        // repeat the previous entry, keyset paging cannot.
        await SolveAsync(database, newcomer);
        var page2 = await reader.ListCompletedForPlayerAsync(
            "player-a", 2, 1, default, position);
        var secondItem = Assert.Single(page2.Items);
        Assert.NotEqual(firstItem.GrantId, secondItem.GrantId);
        Assert.Contains(secondItem.GrantId, new[] { first.Id, second.Id });
        Assert.False(page2.HasMore);
        Assert.Null(page2.NextCursor);

        var fresh = await reader.ListCompletedForPlayerAsync("player-a", 1, 1);
        Assert.Equal(newcomer.Id, Assert.Single(fresh.Items).GrantId);
        Assert.Empty((await reader.ListCompletedForPlayerAsync("player-b", 1, 20)).Items);
    }

    [PostgresIntegrationFact]
    public async Task OutcomeSeek_PreservesFirstMistakeAndCompletion_AfterNewerAudit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var first = CreateGrant("player-a", now);
        var newcomer = CreateGrant("player-a", now);
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            var grants = new ExclusiveContentGrantRepository(setup);
            await grants.AddAsync(first);
            await grants.AddAsync(newcomer);
            await new PlayerCharacterRepository(setup).AddAsync(PlayerCharacter.Create(
                "player-a", "Seek explorer",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance(
                    "hair-1", "black", "face-1", "body-1", "skin-1",
                    "blue", "shorts", "black", "shoe-1", "white")));
            await setup.SaveChangesAsync();
        }

        await using (var db = database.CreateDbContext())
        {
            var damaged = await new PortalMistakeDamageRepository(db, new GameEventStore(db))
                .ApplyFirstMistakeAsync("player-a", first.Id, DateTimeOffset.UtcNow);
            Assert.NotNull(damaged);
            Assert.True(damaged.Applied);
        }
        await SolveAsync(database, first);
        var tie = now.AddMinutes(-1);
        await ForceSameAuditTimeAsync(database, tie, "exclusive_content.consumed", first.PlayerId);
        await ForceSameAuditTimeAsync(database, tie, "portal.sequence_mistake_damage", first.PlayerId);

        await using var verification = database.CreateDbContext();
        var reader = new PortalOutcomeHistoryReader(verification);
        var page1 = await reader.ListForPlayerAsync("player-a", 1, 1);
        var firstEvent = Assert.Single(page1.Items);
        Assert.True(page1.HasMore);
        Assert.NotNull(page1.NextCursor);
        Assert.True(PortalHistoryCursor.TryDecode(page1.NextCursor, out var position));
        Assert.NotNull(position);

        await SolveAsync(database, newcomer);
        var page2 = await reader.ListForPlayerAsync("player-a", 2, 1, default, position);
        var secondEvent = Assert.Single(page2.Items);
        Assert.NotEqual(firstEvent.EventId, secondEvent.EventId);
        Assert.Equal(first.Id, secondEvent.GrantId);
        Assert.False(page2.HasMore);
        Assert.Null(page2.NextCursor);
        Assert.Equal(newcomer.Id, Assert.Single((await reader.ListForPlayerAsync(
            "player-a", 1, 1)).Items).GrantId);
        Assert.Empty((await reader.ListForPlayerAsync("player-b", 1, 20)).Items);
    }

    private static async Task SolveAsync(PostgresDatabaseScope database, ExclusiveContentGrant grant)
    {
        await using var db = database.CreateDbContext();
        var service = new ExclusiveContentService(
            new ExclusiveContentGrantRepository(db), new GameEventStore(db),
            db, TimeProvider.System, new PlayerInventoryRepository(db));
        var sequence = (await service.GetChallengeAsync(grant.PlayerId, grant.Id)).Sequence;
        await service.SubmitChallengeAsync(grant.PlayerId, grant.Id, sequence);
    }

    private static async Task ForceSameAuditTimeAsync(
        PostgresDatabaseScope database, DateTimeOffset time, string eventType, string playerId)
    {
        // PostgreSQL stores microseconds, so normalize 100ns ticks.
        time = time.AddTicks(-(time.Ticks % 10));
        await using var db = database.CreateDbContext();
        var audit = await db.GameEvents.Where(x => x.PlayerId == playerId &&
            x.EventType == eventType).ToArrayAsync();
        Assert.NotEmpty(audit);
        foreach (var eventRecord in audit) eventRecord.OccurredAtUtc = time;
        await db.SaveChangesAsync();
    }

    private static ExclusiveContentGrant CreateGrant(string owner, DateTimeOffset now) =>
        ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), owner,
            "portal.memory.grove", PortalSequenceRules.PortalKey, "dialog-reference",
            "reward-unsupported", 91811, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-10), now.AddHours(2));
}
