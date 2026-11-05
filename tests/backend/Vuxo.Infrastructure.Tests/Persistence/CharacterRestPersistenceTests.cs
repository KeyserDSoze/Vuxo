using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Vuxo.Infrastructure.Persistence.Entities;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class CharacterRestPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task Rest_UpdatesOwnerHpAndAuditAtomically_WithReplayAndCooldown()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var character = await SeedDamagedAsync(database);
        var key = Guid.NewGuid();
        var now = new DateTimeOffset(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);

        await using (var db = database.CreateDbContext())
        {
            var service = NewStore(db);
            var result = await service.RestAsync("player-a", key, now);
            Assert.Equal(7, result.PreviousHealth);
            Assert.Equal(12, result.CurrentHealth);
            Assert.Equal(20, result.MaxHealth);
            Assert.Equal(5, result.RestoredHealth);
            Assert.False(result.Replayed);
            Assert.Equal(now.AddMinutes(30), result.NextRestAtUtc);
        }

        await using (var db = database.CreateDbContext())
        {
            var service = NewStore(db);
            var replay = await service.RestAsync("player-a", key, now.AddHours(2));
            Assert.True(replay.Replayed);
            Assert.Equal(12, replay.CurrentHealth);

            var error = await Assert.ThrowsAsync<CharacterRestException>(() =>
                service.RestAsync("player-a", Guid.NewGuid(), now.AddMinutes(20)));
            Assert.Equal(CharacterRestErrorCodes.Cooldown, error.Code);
            Assert.Equal(now.AddMinutes(30), error.NextAllowedAtUtc);
        }

        await using var verify = database.CreateDbContext();
        var actual = await new PlayerCharacterRepository(verify).GetByOwnerIdAsync("player-a");
        Assert.NotNull(actual);
        Assert.Equal(character.Id, actual.Id);
        Assert.Equal(12, actual.CurrentHealth);
        var action = Assert.Single(await verify.CharacterRestActions.ToListAsync());
        Assert.Equal("player-a", action.PlayerId);
        Assert.Equal(key, action.IdempotencyKey);
        var evt = Assert.Single((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
        Assert.Equal("character.rest_completed", evt.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Player, evt.Envelope.VisibilityScope);
        Assert.Equal(CharacterRestRules.Version, evt.Envelope.RuleVersion);
        Assert.Equal(key, evt.Envelope.CorrelationId);
        Assert.Contains("\"previousHealth\":7", evt.PayloadJson, StringComparison.Ordinal);
        Assert.Contains("\"currentHealth\":12", evt.PayloadJson, StringComparison.Ordinal);
        Assert.Contains("\"restoredHealth\":5", evt.PayloadJson, StringComparison.Ordinal);
    }

    [PostgresIntegrationFact]
    public async Task TwoConcurrentRequestsForSamePlayer_OnlyOneRestoresHp()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedDamagedAsync(database);
        var now = DateTimeOffset.UtcNow;
        async Task<(bool Success, string? Code)> TryRestAsync(Guid id)
        {
            await using var db = database.CreateDbContext();
            try
            {
                await NewStore(db).RestAsync("player-a", id, now);
                return (true, null);
            }
            catch (CharacterRestException ex)
            {
                return (false, ex.Code);
            }
        }

        var outcomes = await Task.WhenAll(
            TryRestAsync(Guid.NewGuid()), TryRestAsync(Guid.NewGuid()));
        Assert.Single(outcomes.Where(x => x.Success));
        Assert.Single(outcomes.Where(x => x.Code == CharacterRestErrorCodes.Cooldown));
        await using var verify = database.CreateDbContext();
        Assert.Single(await verify.CharacterRestActions.ToListAsync());
        Assert.Equal(12, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Single((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task FailureSavingAudit_RollsBackHpReceiptAndEvent()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedDamagedAsync(database);
        await using (var db = database.CreateDbContext())
        {
            // FK-invalid row staged in the same context forces SaveChanges to
            // fail; its transaction must roll back HP, receipt and the audit.
            db.PlayerEquippedItems.Add(new PlayerEquippedItemEntity
            {
                PlayerId = "player-a",
                Slot = "relic",
                GrantId = Guid.NewGuid(),
                EquippedAtUtc = DateTimeOffset.UtcNow
            });
            await Assert.ThrowsAsync<DbUpdateException>(() =>
                NewStore(db).RestAsync("player-a", Guid.NewGuid(), DateTimeOffset.UtcNow));
        }

        await using var verify = database.CreateDbContext();
        Assert.Equal(7, (await new PlayerCharacterRepository(verify)
            .GetByOwnerIdAsync("player-a"))!.CurrentHealth);
        Assert.Empty(await verify.CharacterRestActions.ToListAsync());
        Assert.Empty((await new GameEventStore(verify).QueryAsync(
            new GameEventQuery(PlayerId: "player-a"))).Items);
    }

    [PostgresIntegrationFact]
    public async Task OwnerAndCurrentHealthGates_RejectWithoutMutating()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await SeedDamagedAsync(database);
        await using var db = database.CreateDbContext();
        var now = DateTimeOffset.UtcNow;
        var store = NewStore(db);
        var unknown = await Assert.ThrowsAsync<CharacterRestException>(() =>
            store.RestAsync("other-player", Guid.NewGuid(), now));
        Assert.Equal(CharacterRestErrorCodes.CharacterNotFound, unknown.Code);

        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE player_characters SET \"CurrentHealth\" = {20} WHERE \"OwnerId\" = {"player-a"}");
        var full = await Assert.ThrowsAsync<CharacterRestException>(() =>
            store.RestAsync("player-a", Guid.NewGuid(), now));
        Assert.Equal(CharacterRestErrorCodes.AlreadyFull, full.Code);
        Assert.Empty(await db.CharacterRestActions.ToListAsync());
    }

    private static CharacterRestRepository NewStore(VuxoDbContext db) =>
        new(db, new GameEventStore(db));

    private static async Task<PlayerCharacter> SeedDamagedAsync(PostgresDatabaseScope database)
    {
        var character = PlayerCharacter.Create(
            "player-a", "Rest Vuxian", PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance("hair-1", "black", "face-1", "body-1",
                "skin-1", "blue", "shorts", "black", "shoe-1", "white"));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new PlayerCharacterRepository(db).AddAsync(character);
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE player_characters SET \"CurrentHealth\" = {7} WHERE \"OwnerId\" = {"player-a"}");
        return character;
    }
}
