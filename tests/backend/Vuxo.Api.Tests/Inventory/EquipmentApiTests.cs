using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;
using Vuxo.Domain.Inventory;
using Vuxo.Domain.Players;
using Vuxo.Application.Worlds.Realtime;

namespace Vuxo.Api.Tests.Inventory;

public sealed class EquipmentApiTests
{
    [Fact]
    public async Task Equipment_RequiresAuth_AndNeverListsOtherPlayerAwards()
    {
        using var factory = CreateFactory(out var inventory, out _, out _, out _);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/inventory/stacks")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/equipment")).StatusCode);

        await LoginAsync(client, "player-b");
        var ownStacks = await client.GetFromJsonAsync<JsonElement>("/api/inventory/stacks");
        Assert.Empty(ownStacks.EnumerateArray());
        var stolen = await client.PostAsync(
            $"/api/equipment/{inventory.Awards[0].GrantId}/equip", null);
        Assert.Equal(HttpStatusCode.NotFound, stolen.StatusCode);
        Assert.Equal("equipment_item_not_owned", await ReadCodeAsync(stolen));
    }

    [Fact]
    public async Task Equipment_GroupsAwardsEquipsFromServerAndRefusesInvalidOrDuplicateSlot()
    {
        using var factory = CreateFactory(out var inventory, out var equipment, out var events, out var unit);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");

        var stacked = await client.GetFromJsonAsync<JsonElement>("/api/inventory/stacks");
        var runeStack = stacked.EnumerateArray().Single(x =>
            x.GetProperty("itemKey").GetString() == InventoryItemCatalog.RuneShard);
        Assert.Equal(2, runeStack.GetProperty("quantity").GetInt32());
        Assert.Equal(0, runeStack.GetProperty("equippedQuantity").GetInt32());
        Assert.Equal(2, runeStack.GetProperty("availableGrantIds").GetArrayLength());

        var relicGrant = inventory.Awards[0].GrantId;
        var equip = await client.PostAsync($"/api/equipment/{relicGrant}/equip", null);
        Assert.Equal(HttpStatusCode.OK, equip.StatusCode);
        using var json = JsonDocument.Parse(await equip.Content.ReadAsStringAsync());
        var stats = json.RootElement.GetProperty("stats");
        Assert.Equal(3, stats.GetProperty("intelligence").GetInt32());
        Assert.Equal(20, stats.GetProperty("maxHealth").GetInt32());
        Assert.Equal(1, stats.GetProperty("bonuses").GetProperty("intelligence").GetInt32());
        var item = Assert.Single(json.RootElement.GetProperty("items").EnumerateArray().ToArray());
        Assert.False(item.TryGetProperty("correlationId", out _));
        Assert.False(item.TryGetProperty("playerId", out _));

        var same = await client.PostAsync($"/api/equipment/{relicGrant}/equip", null);
        Assert.Equal(HttpStatusCode.Conflict, same.StatusCode);
        Assert.Equal("equipment_item_already_equipped", await ReadCodeAsync(same));

        var alternateRune = await client.PostAsync(
            $"/api/equipment/{inventory.Awards[1].GrantId}/equip", null);
        Assert.Equal(HttpStatusCode.Conflict, alternateRune.StatusCode);
        Assert.Equal("equipment_slot_occupied", await ReadCodeAsync(alternateRune));

        var charm = await client.PostAsync(
            $"/api/equipment/{inventory.Awards[2].GrantId}/equip", null);
        Assert.Equal(HttpStatusCode.OK, charm.StatusCode);
        var rivalCharm = await client.PostAsync(
            $"/api/equipment/{inventory.Awards[3].GrantId}/equip", null);
        Assert.Equal(HttpStatusCode.Conflict, rivalCharm.StatusCode);
        Assert.Equal("equipment_slot_occupied", await ReadCodeAsync(rivalCharm));

        var invalid = await client.DeleteAsync("/api/equipment/not-a-slot");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal("equipment_invalid_slot", await ReadCodeAsync(invalid));

        var unequip = await client.DeleteAsync("/api/equipment/relic");
        Assert.Equal(HttpStatusCode.OK, unequip.StatusCode);
        var repeated = await client.DeleteAsync("/api/equipment/relic");
        Assert.Equal(HttpStatusCode.Conflict, repeated.StatusCode);
        Assert.Equal("equipment_slot_empty", await ReadCodeAsync(repeated));

        var finalStacks = await client.GetFromJsonAsync<JsonElement>("/api/inventory/stacks");
        var rune = finalStacks.EnumerateArray().Single(x =>
            x.GetProperty("itemKey").GetString() == InventoryItemCatalog.RuneShard);
        Assert.Equal(2, rune.GetProperty("quantity").GetInt32());
        Assert.Equal(0, rune.GetProperty("equippedQuantity").GetInt32());
        Assert.Equal(3, unit.SaveCalls);
        Assert.Equal(3, events.Appended.Count);
        Assert.All(events.Appended, x => Assert.Equal(GameEventVisibilityScope.Player,
            x.Envelope.VisibilityScope));
        Assert.Single(equipment.Items, x => x.Slot == EquipmentRules.Charm);
    }

    [Fact]
    public async Task Equip_OnlyCommittedOwnerDexterityChangesAuthoritativeOnlineMovementSpeed()
    {
        using var factory = CreateFactory(out var inventory, out _, out _, out _);
        using var client = factory.CreateClient();
        await LoginAsync(client, "player-a");

        var simulation = factory.Services.GetRequiredService<WorldSimulation>();
        var character = PlayerCharacter.Create("player-a", "Speed Hero",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "bottom-1", "black", "shoe-1", "white"));
        var joined = simulation.Join("speed-connection", "player-a", character,
            new WorldSpawnPoint(0.5, 0.5));
        Assert.Equal(1.2d, joined.Self.SpeedMultiplier, 8);

        var award = Assert.Single(inventory.Awards,
            x => x.ItemKey == InventoryItemCatalog.SwiftFeather);

        using var other = factory.CreateClient();
        await LoginAsync(other, "player-b");
        var denied = await other.PostAsJsonAsync(
            $"/api/equipment/{award.GrantId}/equip",
            new { speedMultiplier = 900, playerId = "player-a" });
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        Assert.Equal(1.2d, Assert.Single(simulation.Snapshot()).SpeedMultiplier, 8);

        var equip = await client.PostAsJsonAsync(
            $"/api/equipment/{award.GrantId}/equip",
            new { speedMultiplier = 900, dexterity = 900, ownerId = "player-b" });
        Assert.Equal(HttpStatusCode.OK, equip.StatusCode);
        var boosted = Assert.Single(simulation.Snapshot());
        Assert.Equal(1.3d, boosted.SpeedMultiplier, 8);
        Assert.True(boosted.Revision > joined.Self.Revision);
        Assert.Equal(joined.Self.X, boosted.X);

        var replay = await client.PostAsync($"/api/equipment/{award.GrantId}/equip", null);
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        Assert.Equal(boosted.Revision, Assert.Single(simulation.Snapshot()).Revision);

        var removed = await client.DeleteAsync("/api/equipment/charm");
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var normal = Assert.Single(simulation.Snapshot());
        Assert.Equal(1.2d, normal.SpeedMultiplier, 8);
        Assert.True(normal.Revision > boosted.Revision);
    }

    private static VuxoApiFactory CreateFactory(
        out FakeInventory inventory,
        out FakeEquipment equipment,
        out FakeEvents events,
        out FakeUnit unit)
    {
        inventory = new FakeInventory();
        equipment = new FakeEquipment();
        events = new FakeEvents();
        unit = new FakeUnit();
        var stock = inventory;
        var equipped = equipment;
        var audit = events;
        var unitOfWork = unit;

        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IPlayerInventoryRepository>();
            services.RemoveAll<IPlayerEquipmentRepository>();
            services.RemoveAll<IPlayerCharacterRepository>();
            services.RemoveAll<IGameEventStore>();
            services.RemoveAll<IUnitOfWork>();
            services.AddSingleton<IPlayerInventoryRepository>(stock);
            services.AddSingleton<IPlayerEquipmentRepository>(equipped);
            services.AddSingleton<IPlayerCharacterRepository>(new FakeCharacters());
            services.AddSingleton<IGameEventStore>(audit);
            services.AddSingleton<IUnitOfWork>(unitOfWork);
        });
    }

    private static async Task LoginAsync(HttpClient client, string player)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock",
            new { subject = player, displayName = player, role = "User" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<MockLogin>();
        Assert.NotNull(json);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", json.AccessToken);
    }

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>())?.Code;

    private sealed record MockLogin(string AccessToken);
    private sealed record ErrorResponse(string Code);

    private sealed class FakeInventory : IPlayerInventoryRepository
    {
        public List<PlayerInventoryAward> Awards { get; } = new[]
        {
            NewAward(InventoryItemCatalog.RuneShard),
            NewAward(InventoryItemCatalog.RuneShard),
            NewAward(InventoryItemCatalog.GroveSeed),
            NewAward(InventoryItemCatalog.TidalPearl),
            NewAward(InventoryItemCatalog.SwiftFeather)
        }.ToList();

        private static PlayerInventoryAward NewAward(string key) =>
            new(Guid.NewGuid(), Guid.NewGuid(), "player-a", key,
                DateTimeOffset.UtcNow, Guid.NewGuid(), Guid.NewGuid());

        public Task AddAsync(PlayerInventoryAward award, CancellationToken cancellationToken = default)
        {
            Awards.Add(award);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<PlayerInventoryAward>> GetForPlayerAsync(
            string playerId, CancellationToken cancellationToken = default)
        {
            IReadOnlyList<PlayerInventoryAward> found =
                Awards.Where(x => x.PlayerId == playerId).ToArray();
            return Task.FromResult(found);
        }
    }

    private sealed class FakeEquipment : IPlayerEquipmentRepository
    {
        public List<EquippedInventoryItem> Items { get; } = [];

        public Task<IReadOnlyList<EquippedInventoryItem>> GetForPlayerAsync(
            string playerId, CancellationToken cancellationToken = default)
        {
            IReadOnlyList<EquippedInventoryItem> result = Items
                .Where(x => x.PlayerId == playerId).ToArray();
            return Task.FromResult(result);
        }

        public Task EquipAsync(EquippedInventoryItem item, CancellationToken cancellationToken = default)
        {
            Items.Add(item);
            return Task.CompletedTask;
        }

        public Task UnequipAsync(string playerId, string slot,
            CancellationToken cancellationToken = default)
        {
            Items.RemoveAll(x => x.PlayerId == playerId && x.Slot == slot);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeCharacters : IPlayerCharacterRepository
    {
        public Task<PlayerCharacter?> GetByOwnerIdAsync(
            string ownerId, CancellationToken cancellationToken = default)
        {
            PlayerCharacter? result = ownerId == "player-a" ?
                PlayerCharacter.Create(ownerId, "Equip Vuxian",
                    PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                    new CharacterAppearance("hair-1", "black", "face-1",
                        "body-1", "skin-1", "blue", "bottom-1", "black",
                        "shoe-1", "white")) : null;
            return Task.FromResult(result);
        }

        public Task AddAsync(PlayerCharacter character,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class FakeEvents : IGameEventStore
    {
        public List<(GameEventEnvelope Envelope, string PayloadJson)> Appended { get; } = [];
        public Task AppendAsync(GameEventEnvelope envelope, string json,
            CancellationToken cancellationToken = default)
        {
            Appended.Add((envelope, json));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnit : IUnitOfWork
    {
        public int SaveCalls { get; private set; }
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }
}
