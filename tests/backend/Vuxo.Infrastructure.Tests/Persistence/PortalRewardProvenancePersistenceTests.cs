using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalRewardProvenancePersistenceTests
{
    [PostgresIntegrationFact]
    public async Task OnlyCausallyAuditedAwardsAreShownNextToVerifiedSequenceCompletions()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var realReward = NewGrant("player-a", InventoryItemCatalog.GroveSeed, now);
        var noReward = NewGrant("player-a", "legacy.unknown.reward", now);
        var falseLink = NewGrant("player-a", "legacy.unknown.reward", now);
        var foreignReward = NewGrant("player-b", InventoryItemCatalog.TidalPearl, now);
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            var repo = new ExclusiveContentGrantRepository(setup);
            foreach (var grant in new[] { realReward, noReward, falseLink, foreignReward })
                await repo.AddAsync(grant);
            await setup.SaveChangesAsync();
        }

        foreach (var grant in new[] { realReward, noReward, falseLink, foreignReward })
        {
            await using var db = database.CreateDbContext();
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var sequence = (await service.GetChallengeAsync(grant.PlayerId, grant.Id)).Sequence;
            await service.SubmitChallengeAsync(grant.PlayerId, grant.Id, sequence);
        }

        // Deliberately insert an item for another completed grant, but with
        // a mismatched causation ID. Even a matching grant ID is NOT proof.
        await using (var db = database.CreateDbContext())
        {
            var wrongCause = Guid.NewGuid();
            var awardEventId = Guid.NewGuid();
            await new PlayerInventoryRepository(db).AddAsync(new PlayerInventoryAward(
                falseLink.Id, awardEventId, falseLink.PlayerId,
                InventoryItemCatalog.RuneShard, now, falseLink.CorrelationId, wrongCause));
            await new GameEventStore(db).AppendAsync(new GameEventEnvelope(
                awardEventId, "inventory.item_awarded", GameEventVisibilityScope.Player,
                falseLink.PlayerId, falseLink.CorrelationId, wrongCause,
                falseLink.RuleVersion, now), "{}");
            await db.SaveChangesAsync();
        }

        await using var verification = database.CreateDbContext();
        var realAward = await verification.PlayerInventoryAwards.AsNoTracking()
            .SingleAsync(x => x.GrantId == realReward.Id);
        var awardEvent = await verification.GameEvents.AsNoTracking()
            .SingleAsync(x => x.EventId == realAward.AwardEventId);
        Assert.Equal(realAward.CausationId, awardEvent.CausationId);
        Assert.Equal(realAward.CorrelationId, awardEvent.CorrelationId);

        var completed = await new PortalCompletionHistoryReader(verification)
            .ListCompletedForPlayerAsync("player-a", 1, 20);
        Assert.Collection(completed.Items, _ => { }, _ => { }, _ => { });
        Assert.Equal(InventoryItemCatalog.GroveSeed,
            Assert.Single(completed.Items, x => x.GrantId == realReward.Id).RewardItemKey);
        Assert.Null(Assert.Single(completed.Items, x => x.GrantId == noReward.Id).RewardItemKey);
        Assert.Null(Assert.Single(completed.Items, x => x.GrantId == falseLink.Id).RewardItemKey);

        var outcomes = await new PortalOutcomeHistoryReader(verification)
            .ListForPlayerAsync("player-a", 1, 20);
        Assert.Collection(outcomes.Items, _ => { }, _ => { }, _ => { });
        Assert.All(outcomes.Items, row =>
            Assert.Equal(PortalOutcomeKinds.SequenceCompleted, row.Kind));
        Assert.Equal(InventoryItemCatalog.GroveSeed,
            Assert.Single(outcomes.Items, x => x.GrantId == realReward.Id).RewardItemKey);
        Assert.Null(Assert.Single(outcomes.Items, x => x.GrantId == noReward.Id).RewardItemKey);
        Assert.Null(Assert.Single(outcomes.Items, x => x.GrantId == falseLink.Id).RewardItemKey);
        Assert.DoesNotContain(outcomes.Items, row => row.GrantId == foreignReward.Id);

        var otherOwner = await new PortalOutcomeHistoryReader(verification)
            .ListForPlayerAsync("player-b", 1, 20);
        Assert.Equal(InventoryItemCatalog.TidalPearl, Assert.Single(otherOwner.Items).RewardItemKey);
        Assert.Empty((await new PortalCompletionHistoryReader(verification)
            .ListCompletedForPlayerAsync("nonexistent", 1, 20)).Items);
    }

    private static ExclusiveContentGrant NewGrant(
        string owner, string reward, DateTimeOffset now) =>
        ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), owner,
            "portal.memory.grove", PortalSequenceRules.PortalKey, "dialog",
            reward, 91811, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-10), now.AddHours(1));
}
