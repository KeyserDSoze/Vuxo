using Microsoft.EntityFrameworkCore;
using Vuxo.Application.Inventory;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class EquipmentPersistenceIntegrationTests
{
    [PostgresIntegrationFact]
    public async Task EquipAndUnequip_PersistWithScopedCausalAudit_WithoutChangingBaseStats()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);

        await using (var db = database.CreateDbContext())
        {
            var service = CreateService(db);
            var initial = Assert.Single(await service.GetStacksAsync("player-a"));
            Assert.Equal(1, initial.Quantity);
            Assert.Equal(0, initial.EquippedQuantity);

            var equipped = await service.EquipAsync("player-a", award.GrantId);
            var item = Assert.Single(equipped.Items);
            Assert.Equal(EquipmentRules.Relic, item.Slot);
            Assert.Equal(award.GrantId, item.GrantId);
            Assert.NotNull(equipped.Stats);
            Assert.Equal(3, equipped.Stats.Intelligence);
            Assert.Equal(1, equipped.Stats.Bonuses.Intelligence);
            var equippedStack = Assert.Single(await service.GetStacksAsync("player-a"));
            Assert.Equal(1, equippedStack.EquippedQuantity);
            Assert.Empty(equippedStack.AvailableGrantIds);

            var removed = await service.UnequipAsync("player-a", EquipmentRules.Relic);
            Assert.Empty(removed.Items);
            Assert.NotNull(removed.Stats);
            Assert.Equal(2, removed.Stats.Intelligence);
            var restoredStack = Assert.Single(await service.GetStacksAsync("player-a"));
            Assert.Equal(0, restoredStack.EquippedQuantity);
            Assert.Single(restoredStack.AvailableGrantIds);
        }

        await using var verified = database.CreateDbContext();
        Assert.Empty(await new PlayerEquipmentRepository(verified).GetForPlayerAsync("player-a"));
        var audit = await new GameEventStore(verified).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"));
        Assert.Equal(2, audit.Total);
        Assert.Contains(audit.Items, x => x.Envelope.EventType == "inventory.equipped"
            && x.Envelope.CausationId == award.AwardEventId);
        Assert.Contains(audit.Items, x => x.Envelope.EventType == "inventory.unequipped"
            && x.Envelope.CausationId == award.AwardEventId);
    }

    [PostgresIntegrationFact]
    public async Task OwnershipAndDatabaseUniqueness_RejectForeignPlayerAndDuplicateEquipment()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        await using var db = database.CreateDbContext();

        var service = CreateService(db);
        var wrongOwner = await Assert.ThrowsAsync<EquipmentException>(
            () => service.EquipAsync("player-b", award.GrantId));
        Assert.Equal(EquipmentErrorCodes.NotOwned, wrongOwner.Code);
        await service.EquipAsync("player-a", award.GrantId);
        var replay = await Assert.ThrowsAsync<EquipmentException>(
            () => service.EquipAsync("player-a", award.GrantId));
        Assert.Equal(EquipmentErrorCodes.AlreadyEquipped, replay.Code);

        await using (var forgedDb = database.CreateDbContext())
        {
            forgedDb.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-b", Slot = EquipmentRules.Charm,
                GrantId = award.GrantId, EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(
                () => forgedDb.SaveChangesAsync());
        }

        await using (var duplicateDb = database.CreateDbContext())
        {
            duplicateDb.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a", Slot = EquipmentRules.Charm,
                GrantId = award.GrantId, EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(
                () => duplicateDb.SaveChangesAsync());
        }

        await using var verification = database.CreateDbContext();
        Assert.Single(await new PlayerEquipmentRepository(verification)
            .GetForPlayerAsync("player-a"));
        Assert.Empty(await new PlayerEquipmentRepository(verification)
            .GetForPlayerAsync("player-b"));
    }

    [PostgresIntegrationFact]
    public async Task SaveFailure_RollsBackEquipmentAndAuditTogether()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);

        await using (var db = database.CreateDbContext())
        {
            // Intentionally invalid row: the save must roll back both the
            // legitimate equip and its newly appended audit event.
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-b", Slot = EquipmentRules.Charm,
                GrantId = Guid.NewGuid(), EquippedAtUtc = DateTimeOffset.UtcNow
            });
            var service = CreateService(db);
            await Assert.ThrowsAsync<DbUpdateException>(
                () => service.EquipAsync("player-a", award.GrantId));
        }

        await using var check = database.CreateDbContext();
        Assert.Empty(await new PlayerEquipmentRepository(check)
            .GetForPlayerAsync("player-a"));
        var audit = await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"));
        Assert.Empty(audit.Items);
    }

    private static PlayerEquipmentService CreateService(VuxoDbContext db) =>
        new(new PlayerInventoryRepository(db), new PlayerEquipmentRepository(db),
            new PlayerCharacterRepository(db), new GameEventStore(db), db, TimeProvider.System);

    private static async Task<PlayerInventoryAward> SeedAsync(PostgresDatabaseScope database)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a",
            "portal.relic", PortalSequenceRules.PortalKey,
            "dialog.relic", InventoryItemCatalog.RuneShard,
            42, "personal-content-v1", Guid.NewGuid(), null,
            now.AddHours(-1), now.AddHours(1));
        Assert.True(grant.TryConsume(now));
        var award = PlayerInventoryAward.FromConsumedGrant(
            grant, Guid.NewGuid(), Guid.NewGuid(), now);

        await using var setup = database.CreateDbContext();
        await setup.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(setup).AddAsync(grant);
        await new PlayerInventoryRepository(setup).AddAsync(award);
        await new PlayerCharacterRepository(setup).AddAsync(
            PlayerCharacter.Create("player-a", "Equip Vuxian",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                    "skin-1", "blue", "bottom-1", "black", "shoe-1", "white")));
        await setup.SaveChangesAsync();
        return award;
    }
}
