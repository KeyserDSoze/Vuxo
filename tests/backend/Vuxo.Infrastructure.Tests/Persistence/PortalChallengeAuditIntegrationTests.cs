using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.Events;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalChallengeAuditIntegrationTests
{
    [PostgresIntegrationFact]
    public async Task SolvedChallenge_PersistsOwnerOnlyGrantAndCausalEvent()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a",
            "portal.memory.grove", PortalSequenceRules.PortalKey,
            "dialog", "reward-reference", 42, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-1), now.AddHours(1));

        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            await new ExclusiveContentGrantRepository(setup).AddAsync(grant);
            await setup.SaveChangesAsync();
        }

        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db), db, TimeProvider.System,
                new PlayerInventoryRepository(db));
            var puzzle = await service.GetChallengeAsync("player-a", grant.Id);
            var done = await service.SubmitChallengeAsync("player-a", grant.Id, puzzle.Sequence);
            Assert.True(done.IsConsumed);
        }

        await using var check = database.CreateDbContext();
        var repository = new ExclusiveContentGrantRepository(check);
        Assert.True((await repository.GetByIdForPlayerAsync(grant.Id, "player-a"))!.IsConsumed);
        Assert.Null(await repository.GetByIdForPlayerAsync(grant.Id, "player-b"));
        var page = await new GameEventStore(check).QueryAsync(new GameEventQuery(
            PlayerId: "player-a", FromUtc: null, ToUtc: null, Offset: 0, Limit: 20));
        var audit = Assert.Single(page.Items);
        Assert.Equal("exclusive_content.consumed", audit.Envelope.EventType);
        Assert.Equal(grant.GrantEventId, audit.Envelope.CausationId);
        Assert.Equal(grant.CorrelationId, audit.Envelope.CorrelationId);
        Assert.Contains("portal-sequence-v1", audit.PayloadJson, StringComparison.Ordinal);
    }
}
