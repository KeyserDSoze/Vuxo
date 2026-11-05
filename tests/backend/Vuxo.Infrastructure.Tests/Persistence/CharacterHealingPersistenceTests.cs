using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Vuxo.Application.Inventory;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class CharacterHealingPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task UseItem_HealsPersistsAuditPreservesAwardHistoryAndPreventsReuse()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        var key = Guid.NewGuid();
        var now = new DateTimeOffset(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
        await using (var db = database.CreateDbContext())
        {
            var result = await Store(db).HealAsync("player-a", award.GrantId, key, now);
            Assert.Equal(5, result.PreviousHealth);
            Assert.Equal(15, result.CurrentHealth);
            Assert.Equal(10, result.RestoredHealth);
            Assert.False(result.Replayed);
        }
        await using (var replayDb = database.CreateDbContext())
        {
            var replay = await Store(replayDb).HealAsync("player-a", award.GrantId,
                key, now.AddHours(1));
            Assert.True(replay.Replayed);
            Assert.Equal(15, replay.CurrentHealth);
            var reused = await Assert.ThrowsAsync<CharacterHealingException>(() =>
                Store(replayDb).HealAsync("player-a", award.GrantId,
                    Guid.NewGuid(), now.AddHours(1)));
            Assert.Equal(CharacterHealingErrorCodes.ItemUsed, reused.Code);
        }
        await using var check = database.CreateDbContext();
        Assert.Equal(15, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Single(await new PlayerInventoryRepository(check).GetForPlayerAsync("player-a"));
        Assert.Empty(await new PlayerInventoryRepository(check).GetUnspentForPlayerAsync("player-a"));
        Assert.Single(await check.CharacterItemHeals.ToListAsync());
        var item = Assert.Single((await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
        Assert.Equal("character.item_healed", item.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Player, item.Envelope.VisibilityScope);
        Assert.Equal(CharacterHealingRules.Version, item.Envelope.RuleVersion);
        Assert.Equal(award.AwardEventId, item.Envelope.CausationId);
        Assert.Equal(key, item.Envelope.CorrelationId);
        using var payload = JsonDocument.Parse(item.PayloadJson);
        Assert.Equal(5, payload.RootElement.GetProperty("data")
            .GetProperty("previousHealth").GetInt32());
        Assert.Equal(15, payload.RootElement.GetProperty("data")
            .GetProperty("currentHealth").GetInt32());
        Assert.Equal(10, payload.RootElement.GetProperty("data")
            .GetProperty("restoredHealth").GetInt32());

        // Inventory stack, not immutable award history, reflects consumption.
        var stacks = await Equipment(check).GetStacksAsync("player-a");
        Assert.Empty(stacks);
        var unavailable = await Assert.ThrowsAsync<EquipmentException>(() =>
            Equipment(check).EquipAsync("player-a", award.GrantId));
        Assert.Equal(EquipmentErrorCodes.NotOwned, unavailable.Code);
    }

    [PostgresIntegrationFact]
    public async Task EquippedSeed_CannotBeConsumedUntilUnequipped()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            await Equipment(db).EquipAsync("player-a", award.GrantId);
            var ex = await Assert.ThrowsAsync<CharacterHealingException>(() =>
                Store(db).HealAsync("player-a", award.GrantId,
                    Guid.NewGuid(), DateTimeOffset.UtcNow));
            Assert.Equal(CharacterHealingErrorCodes.ItemEquipped, ex.Code);
        }
        await using (var db = database.CreateDbContext())
        {
            await Equipment(db).UnequipAsync("player-a", EquipmentRules.Charm);
            var outcome = await Store(db).HealAsync("player-a", award.GrantId,
                Guid.NewGuid(), DateTimeOffset.UtcNow);
            Assert.Equal(15, outcome.CurrentHealth);
        }
    }

    [PostgresIntegrationFact]
    public async Task TwoNodesSameKey_ReplayOnceWithSingleReceiptAndHpMutation()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        var key = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        async Task<CharacterHealingResult> UseAsync()
        {
            await using var db = database.CreateDbContext();
            return await Store(db).HealAsync("player-a", award.GrantId, key, now);
        }
        var results = await Task.WhenAll(UseAsync(), UseAsync());
        Assert.Single(results, x => x.Replayed);
        Assert.Single(results, x => !x.Replayed);
        Assert.All(results, x => Assert.Equal(15, x.CurrentHealth));
        await using var check = database.CreateDbContext();
        Assert.Single(await check.CharacterItemHeals.ToListAsync());
        Assert.Equal(15, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
    }

    [PostgresIntegrationFact]
    public async Task TwoNodesDifferentKeys_OnlyOneCanSpendGrant()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        async Task<(bool Success, string? Error)> TryUse(Guid id)
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Store(db).HealAsync("player-a", award.GrantId, id, DateTimeOffset.UtcNow);
                return (true, null);
            }
            catch (CharacterHealingException ex)
            {
                return (false, ex.Code);
            }
        }
        var results = await Task.WhenAll(TryUse(Guid.NewGuid()), TryUse(Guid.NewGuid()));
        Assert.Single(results, x => x.Success);
        Assert.Single(results, x => x.Error == CharacterHealingErrorCodes.ItemUsed);
        await using var check = database.CreateDbContext();
        Assert.Single(await check.CharacterItemHeals.ToListAsync());
        Assert.Equal(15, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
    }

    [PostgresIntegrationFact]
    public async Task OwnerNotFoundAndUnsupportedItem_AreRejectedWithoutSpending()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database, InventoryItemCatalog.RuneShard);
        await using var db = database.CreateDbContext();
        var now = DateTimeOffset.UtcNow;
        var foreign = await Assert.ThrowsAsync<CharacterHealingException>(() =>
            Store(db).HealAsync("player-b", award.GrantId, Guid.NewGuid(), now));
        Assert.Equal(CharacterHealingErrorCodes.CharacterNotFound, foreign.Code);
        var unknown = await Assert.ThrowsAsync<CharacterHealingException>(() =>
            Store(db).HealAsync("player-a", Guid.NewGuid(), Guid.NewGuid(), now));
        Assert.Equal(CharacterHealingErrorCodes.ItemNotOwned, unknown.Code);
        var invalid = await Assert.ThrowsAsync<CharacterHealingException>(() =>
            Store(db).HealAsync("player-a", award.GrantId, Guid.NewGuid(), now));
        Assert.Equal(CharacterHealingErrorCodes.NotConsumable, invalid.Code);
        Assert.Empty(await db.CharacterItemHeals.ToListAsync());
    }

    [PostgresIntegrationFact]
    public async Task FailedAuditSave_RollsBackHpAndItemReceipt()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a", Slot = "relic", GrantId = Guid.NewGuid(),
                EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                Store(db).HealAsync("player-a", award.GrantId, Guid.NewGuid(), DateTimeOffset.UtcNow));
        }
        await using var check = database.CreateDbContext();
        Assert.Equal(5, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Empty(await check.CharacterItemHeals.ToListAsync());
        Assert.Single(await new PlayerInventoryRepository(check).GetUnspentForPlayerAsync("player-a"));
        Assert.Empty((await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task ConcurrentEquipAndConsume_CannotBothCommit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);

        async Task<string> HealAsync()
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Store(db).HealAsync("player-a", award.GrantId,
                    Guid.NewGuid(), DateTimeOffset.UtcNow);
                return "healed";
            }
            catch (CharacterHealingException) { return "heal-rejected"; }
            catch (DbUpdateException) { return "heal-db-rejected"; }
        }
        async Task<string> EquipAsync()
        {
            await using var db = database.CreateDbContext();
            try
            {
                await Equipment(db).EquipAsync("player-a", award.GrantId);
                return "equipped";
            }
            catch (EquipmentException) { return "equip-rejected"; }
            catch (DbUpdateException) { return "equip-db-rejected"; }
        }

        var results = await Task.WhenAll(HealAsync(), EquipAsync());
        Assert.Single(results, x => x is "healed" or "equipped");
        await using var check = database.CreateDbContext();
        var used = await check.CharacterItemHeals.AsNoTracking().CountAsync();
        var equipped = await check.PlayerEquippedItems.AsNoTracking().CountAsync();
        Assert.Equal(1, used + equipped);
        Assert.Equal(used == 1 ? 15 : 5, (await new PlayerCharacterRepository(check)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Equal(1, (await new GameEventStore(check).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Total);
    }

    [PostgresIntegrationFact]
    public async Task Trigger_ProhibitsDirectEquipAfterHealing()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var award = await SeedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            await Store(db).HealAsync("player-a", award.GrantId, Guid.NewGuid(),
                DateTimeOffset.UtcNow);
        }
        await using var check = database.CreateDbContext();
        check.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
        {
            PlayerId = "player-a", Slot = EquipmentRules.Charm,
            GrantId = award.GrantId, EquippedAtUtc = DateTimeOffset.UtcNow
        });
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => check.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.CheckViolation, (error.InnerException as PostgresException)?.SqlState);
        Assert.Empty(await check.PlayerEquippedItems.AsNoTracking().ToListAsync());
    }

    private static CharacterHealingRepository Store(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static PlayerEquipmentService Equipment(VuxoDbContext db) =>
        new(new PlayerInventoryRepository(db), new PlayerEquipmentRepository(db),
            new PlayerCharacterRepository(db), new GameEventStore(db),
            db, TimeProvider.System);

    private static async Task<PlayerInventoryAward> SeedAsync(PostgresDatabaseScope database,
        string itemKey = InventoryItemCatalog.GroveSeed)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(Guid.NewGuid(), Guid.NewGuid(),
            "player-a", "portal.grove", PortalSequenceRules.PortalKey,
            "dialog.grove", itemKey, 4242, "personal-content-v1",
            Guid.NewGuid(), null, now.AddMinutes(-10), now.AddHours(1));
        Assert.True(grant.TryConsume(now));
        var award = PlayerInventoryAward.FromConsumedGrant(
            grant, Guid.NewGuid(), Guid.NewGuid(), now);
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await new PlayerInventoryRepository(db).AddAsync(award);
        await new PlayerCharacterRepository(db).AddAsync(
            PlayerCharacter.Create("player-a", "Healing Vuxian",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                new CharacterAppearance("hair-1", "black", "face-1",
                    "body-1", "skin-1", "blue", "shorts", "black",
                    "shoe-1", "white")));
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE player_characters SET \"CurrentHealth\" = {5} WHERE \"OwnerId\" = {"player-a"}");
        return award;
    }
}
