using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class InventoryAwardIntegrationTests
{
    [PostgresIntegrationFact]
    public async Task SolvedChallenge_PersistsSingleOwnerOnlyAwardAndCausalAudit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = CreateGrant();
        await SeedGrantAsync(database, grant);

        await using (var db = database.CreateDbContext())
        {
            var service = NewService(db);
            var puzzle = await service.GetChallengeAsync("player-a", grant.Id);
            var result = await service.SubmitChallengeAsync("player-a", grant.Id, puzzle.Sequence);
            Assert.True(result.IsConsumed);
        }

        await using var check = database.CreateDbContext();
        var inventory = new PlayerInventoryRepository(check);
        var award = Assert.Single(await inventory.GetForPlayerAsync("player-a"));
        Assert.Equal(grant.Id, award.GrantId);
        Assert.Equal(InventoryItemCatalog.RuneShard, award.ItemKey);
        Assert.Equal(grant.CorrelationId, award.CorrelationId);
        Assert.Empty(await inventory.GetForPlayerAsync("player-b"));

        var storedGrant = await new ExclusiveContentGrantRepository(check)
            .GetByIdForPlayerAsync(grant.Id, "player-a");
        Assert.NotNull(storedGrant);
        Assert.True(storedGrant.IsConsumed);

        var page = await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a", Limit: 20));
        Assert.Equal(2, page.Total);
        var consumed = Assert.Single(page.Items, e => e.Envelope.EventType == "exclusive_content.consumed");
        var awarded = Assert.Single(page.Items, e => e.Envelope.EventType == "inventory.item_awarded");
        Assert.Equal(grant.GrantEventId, consumed.Envelope.CausationId);
        Assert.Equal(consumed.Envelope.EventId, awarded.Envelope.CausationId);
        Assert.Equal(awarded.Envelope.EventId, award.AwardEventId);
        Assert.Equal(grant.CorrelationId, awarded.Envelope.CorrelationId);
        Assert.Contains(InventoryItemCatalog.RuneShard, awarded.PayloadJson, StringComparison.Ordinal);

        await using var replayDb = database.CreateDbContext();
        var replay = NewService(replayDb);
        var error = await Assert.ThrowsAsync<ExclusiveContentException>(
            () => replay.SubmitChallengeAsync("player-a", grant.Id, ["sun", "moon", "star", "wave"]));
        Assert.Equal(ExclusiveContentErrorCodes.Consumed, error.Code);
    }

    [PostgresIntegrationFact]
    public async Task SaveFailure_RollsBackGrantConsumptionAwardAndAuditTogether()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = CreateGrant();
        await SeedGrantAsync(database, grant);

        await using (var db = database.CreateDbContext())
        {
            // Deliberately stage an FK-invalid row to force this SaveChanges to
            // fail after the challenge staged consumption, award and both events.
            db.PlayerInventoryAwards.Add(new PlayerInventoryAwardEntity
            {
                GrantId = Guid.NewGuid(),
                AwardEventId = Guid.NewGuid(),
                PlayerId = "player-a",
                ItemKey = InventoryItemCatalog.GroveSeed,
                AwardedAtUtc = DateTimeOffset.UtcNow,
                CorrelationId = Guid.NewGuid(),
                CausationId = Guid.NewGuid()
            });
            var service = NewService(db);
            var puzzle = await service.GetChallengeAsync("player-a", grant.Id);
            await Assert.ThrowsAsync<DbUpdateException>(
                () => service.SubmitChallengeAsync("player-a", grant.Id, puzzle.Sequence));
        }

        await using var check = database.CreateDbContext();
        var persisted = await new ExclusiveContentGrantRepository(check)
            .GetByIdForPlayerAsync(grant.Id, "player-a");
        Assert.NotNull(persisted);
        Assert.False(persisted.IsConsumed);
        Assert.Empty(await new PlayerInventoryRepository(check).GetForPlayerAsync("player-a"));
        Assert.Equal(0, (await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Total);
    }

    [PostgresIntegrationFact]
    public async Task UniqueGrantIdPreventsSecondAwardAcrossDbContexts()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = CreateGrant();
        await SeedGrantAsync(database, grant);

        await using (var db = database.CreateDbContext())
        {
            var service = NewService(db);
            var puzzle = await service.GetChallengeAsync("player-a", grant.Id);
            await service.SubmitChallengeAsync("player-a", grant.Id, puzzle.Sequence);
        }

        await using (var duplicateDb = database.CreateDbContext())
        {
            await new PlayerInventoryRepository(duplicateDb).AddAsync(
                new PlayerInventoryAward(
                    grant.Id, Guid.NewGuid(), grant.PlayerId,
                    InventoryItemCatalog.RuneShard, DateTimeOffset.UtcNow,
                    grant.CorrelationId, grant.GrantEventId));
            await Assert.ThrowsAsync<DbUpdateException>(() => duplicateDb.SaveChangesAsync());
        }

        await using var check = database.CreateDbContext();
        Assert.Single(await new PlayerInventoryRepository(check).GetForPlayerAsync("player-a"));
    }

    private static ExclusiveContentService NewService(VuxoDbContext db)
        => new(
            new ExclusiveContentGrantRepository(db),
            new GameEventStore(db), db, TimeProvider.System,
            new PlayerInventoryRepository(db));

    private static async Task SeedGrantAsync(PostgresDatabaseScope database, ExclusiveContentGrant grant)
    {
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await db.SaveChangesAsync();
    }

    private static ExclusiveContentGrant CreateGrant()
    {
        var now = DateTimeOffset.UtcNow;
        return ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a",
            "portal.grove", PortalSequenceRules.PortalKey, "dialog.grove",
            InventoryItemCatalog.RuneShard, 4242, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-10), now.AddHours(1));
    }
}
