using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalCompletionHistoryPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task History_OnlyIncludesVerifiedSequenceAuditEvents_ForTheOwnerAndPaginates()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        // PostgreSQL timestamps have microsecond precision, not 100ns ticks.
        now = now.AddTicks(-(now.Ticks % 10));
        var first = NewGrant("player-a", now, PortalSequenceRules.PortalKey);
        var second = NewGrant("player-a", now, PortalSequenceRules.PortalKey);
        var anotherOwner = NewGrant("player-b", now, PortalSequenceRules.PortalKey);
        var legacyWithoutAudit = NewGrant("player-a", now, PortalSequenceRules.PortalKey);
        var unrelated = NewGrant("player-a", now, "another.portal.type");
        Assert.True(legacyWithoutAudit.TryConsume(now.AddSeconds(-1)));
        Assert.True(unrelated.TryConsume(now.AddSeconds(-1)));

        await using (var db = database.CreateDbContext())
        {
            await db.Database.MigrateAsync();
            var repo = new ExclusiveContentGrantRepository(db);
            foreach (var grant in new[] { first, second, anotherOwner, legacyWithoutAudit, unrelated })
                await repo.AddAsync(grant);
            await db.SaveChangesAsync();
        }

        // Only the canonical success path creates a "sequence" consumption
        // audit event. No inference from an unverified legacy consumption.
        foreach (var grant in new[] { first, second, anotherOwner })
        {
            await using var db = database.CreateDbContext();
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db),
                new GameEventStore(db),
                db,
                TimeProvider.System,
                new PlayerInventoryRepository(db));
            var challenge = await service.GetChallengeAsync(grant.PlayerId, grant.Id);
            var wrong = challenge.Sequence.ToArray();
            wrong[0] = wrong[0] == "sun" ? "moon" : "sun";
            var mistake = await Assert.ThrowsAsync<ExclusiveContentException>(() =>
                service.SubmitChallengeAsync(grant.PlayerId, grant.Id, wrong));
            Assert.Equal(ExclusiveContentErrorCodes.ChallengeIncorrect, mistake.Code);

            await service.SubmitChallengeAsync(grant.PlayerId, grant.Id, challenge.Sequence);
        }

        await using var verification = database.CreateDbContext();
        var reader = new PortalCompletionHistoryReader(verification);
        var page1 = await reader.ListCompletedForPlayerAsync("player-a", 1, 1);
        var page2 = await reader.ListCompletedForPlayerAsync("player-a", 2, 1);
        var emptyPage = await reader.ListCompletedForPlayerAsync("player-a", 3, 1);
        var otherPage = await reader.ListCompletedForPlayerAsync("player-b", 1, 20);

        Assert.Single(page1.Items);
        Assert.Single(page2.Items);
        Assert.True(page1.HasMore);
        Assert.False(page2.HasMore);
        Assert.Empty(emptyPage.Items);
        Assert.False(emptyPage.HasMore);
        Assert.Equal(new[] { first.Id, second.Id }.Order(),
            page1.Items.Concat(page2.Items).Select(x => x.GrantId).Order());
        Assert.All(page1.Items.Concat(page2.Items), row =>
        {
            Assert.Equal("portal.memory.grove", row.ContentKey);
            Assert.Equal("personal-content-v1", row.RuleVersion);
            Assert.Equal(now.AddMinutes(-10), row.GrantedAtUtc);
            Assert.True(row.CompletedAtUtc >= now);
            Assert.DoesNotContain(row.GrantId,
                new[] { legacyWithoutAudit.Id, unrelated.Id, anotherOwner.Id });
        });
        Assert.Equal(anotherOwner.Id, Assert.Single(otherPage.Items).GrantId);
        Assert.False(otherPage.HasMore);

        // A valid consumed grant is not sufficient if its supposedly verified
        // completion event disagrees with the original grant's correlation.
        var firstAudit = await verification.GameEvents.AsNoTracking()
            .SingleAsync(x => x.EventType == "exclusive_content.consumed"
                && x.CausationId == first.GrantEventId);
        await verification.GameEvents
            .Where(x => x.EventId == firstAudit.EventId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.CorrelationId, Guid.NewGuid()));

        var withoutWrongCorrelation = await reader.ListCompletedForPlayerAsync("player-a", 1, 20);
        Assert.Equal(second.Id, Assert.Single(withoutWrongCorrelation.Items).GrantId);

        // Equally reject a real consumption event with forged rule metadata.
        var secondAudit = await verification.GameEvents.AsNoTracking()
            .SingleAsync(x => x.EventType == "exclusive_content.consumed"
                && x.CausationId == second.GrantEventId);
        await verification.GameEvents
            .Where(x => x.EventId == secondAudit.EventId)
            .ExecuteUpdateAsync(update => update.SetProperty(
                x => x.RuleVersion, "forged-rules"));
        Assert.Empty((await reader.ListCompletedForPlayerAsync("player-a", 1, 20)).Items);
        // The other owner's legitimate completion remains untouched.
        Assert.Equal(anotherOwner.Id, Assert.Single(
            (await reader.ListCompletedForPlayerAsync("player-b", 1, 20)).Items).GrantId);
    }

    private static ExclusiveContentGrant NewGrant(
        string owner, DateTimeOffset now, string portalKey) =>
        ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), owner,
            "portal.memory.grove", portalKey, "dialog-reference",
            "reward-unsupported", 91811, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-10), now.AddHours(2));
}
