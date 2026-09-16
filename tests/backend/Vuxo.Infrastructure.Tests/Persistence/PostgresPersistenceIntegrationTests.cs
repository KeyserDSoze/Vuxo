using Microsoft.EntityFrameworkCore;
using Npgsql;
using Vuxo.Domain.Events;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PostgresPersistenceIntegrationTests
{
    private static readonly DateTimeOffset BaseTime = new(2026, 9, 16, 10, 0, 0, TimeSpan.Zero);

    [PostgresIntegrationFact]
    public async Task EmptyDatabase_MigrateAsync_AppliesEveryApplicationMigration()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        await using var db = database.CreateDbContext();

        var expected = db.Database.GetMigrations().ToArray();
        Assert.NotEmpty(expected);

        await db.Database.MigrateAsync();

        var applied = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
        Assert.Equal(expected, applied);
        Assert.Contains("202609160001_Initial", applied);
        Assert.Contains("202609160002_WorldGeneration", applied);
        Assert.Contains("202609160003_ExclusiveContent", applied);
        Assert.Contains("202609160004_AuditQueries", applied);

        await using var command = db.Database.GetDbConnection().CreateCommand();
        await db.Database.OpenConnectionAsync();
        command.CommandText = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('player_characters', 'game_events', 'world_definitions', 'world_chunks', 'exclusive_content_grants')
            ORDER BY table_name;
            """;

        var tables = new List<string>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tables.Add(reader.GetString(0));
        }

        Assert.Equal(
            ["exclusive_content_grants", "game_events", "player_characters", "world_chunks", "world_definitions"],
            tables);
    }

    [PostgresIntegrationFact]
    public async Task PlayerCharacterRepository_RoundTripsEveryField_AndDatabaseRejectsDuplicateOwner()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var appearance = new CharacterAppearance(
            "short",
            "black",
            "round",
            "medium",
            "warm",
            "ocean",
            "trousers",
            "charcoal",
            "boots",
            "brown");
        var attributes = PlayerAttributes.Create(
            strength: 2,
            dexterity: 3,
            intelligence: 1,
            constitution: 2,
            luck: 1,
            faith: 1);
        var character = PlayerCharacter.Create("owner-postgres-a", "Persisted Hero", attributes, appearance);

        await using (var db = database.CreateDbContext())
        {
            await db.Database.MigrateAsync();
            var repository = new PlayerCharacterRepository(db);
            await repository.AddAsync(character);
            await db.SaveChangesAsync();
        }

        await using (var db = database.CreateDbContext())
        {
            var repository = new PlayerCharacterRepository(db);
            var persisted = await repository.GetByOwnerIdAsync(character.OwnerId);

            Assert.NotNull(persisted);
            Assert.Equal(character.Id, persisted.Id);
            Assert.Equal(character.OwnerId, persisted.OwnerId);
            Assert.Equal(character.Name, persisted.Name);
            Assert.Equal(0, persisted.Level);
            Assert.Equal(attributes, persisted.Attributes);
            Assert.Equal(appearance, persisted.Appearance);
            Assert.Equal(20, persisted.Attributes.MaxHealth);
            Assert.Equal(1.3d, persisted.Attributes.MovementSpeedMultiplier, 10);
        }

        await using (var db = database.CreateDbContext())
        {
            var repository = new PlayerCharacterRepository(db);
            var duplicate = PlayerCharacter.Create(
                character.OwnerId,
                "Other Hero",
                PlayerAttributes.Create(1, 1, 2, 2, 2, 2),
                appearance);

            await repository.AddAsync(duplicate);
            var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            var postgres = Assert.IsType<PostgresException>(exception.InnerException);
            Assert.Equal(PostgresErrorCodes.UniqueViolation, postgres.SqlState);
        }
    }

    [PostgresIntegrationFact]
    public async Task GameEventStore_AppendsAndQueriesByPlayerAndTime_OnPostgreSql()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var correlation = Guid.NewGuid();
        var expectedId = Guid.NewGuid();
        const string expectedPayload = "{\"schemaVersion\":1,\"kind\":\"persistence.expected\",\"data\":{\"value\":42}}";

        await using (var db = database.CreateDbContext())
        {
            await db.Database.MigrateAsync();
            var store = new GameEventStore(db);

            await store.AppendAsync(Envelope(
                expectedId,
                "player-a",
                "persistence.expected",
                correlation,
                BaseTime.AddMinutes(5)), expectedPayload);
            await store.AppendAsync(Envelope(
                Guid.NewGuid(),
                "player-a",
                "persistence.too-old",
                correlation,
                BaseTime.AddHours(-2)), "{\"schemaVersion\":1,\"kind\":\"old\",\"data\":{}}");
            await store.AppendAsync(Envelope(
                Guid.NewGuid(),
                "player-b",
                "persistence.other-player",
                correlation,
                BaseTime.AddMinutes(5)), "{\"schemaVersion\":1,\"kind\":\"other\",\"data\":{}}");

            await db.SaveChangesAsync();
        }

        await using (var db = database.CreateDbContext())
        {
            var store = new GameEventStore(db);
            var page = await store.QueryAsync(new GameEventQuery(
                PlayerId: "player-a",
                FromUtc: BaseTime,
                ToUtc: BaseTime.AddMinutes(30),
                Offset: 0,
                Limit: 20));

            var item = Assert.Single(page.Items);
            Assert.Equal(1, page.Total);
            Assert.Equal(expectedId, item.Envelope.EventId);
            Assert.Equal("player-a", item.Envelope.PlayerId);
            Assert.Equal(correlation, item.Envelope.CorrelationId);
            Assert.Equal(BaseTime.AddMinutes(5), item.Envelope.OccurredAtUtc);
            Assert.Equal(expectedPayload, item.PayloadJson);

            var byId = await store.GetByIdAsync(expectedId);
            Assert.NotNull(byId);
            Assert.Equal(expectedPayload, byId.PayloadJson);
        }
    }

    private static GameEventEnvelope Envelope(
        Guid eventId,
        string playerId,
        string eventType,
        Guid correlationId,
        DateTimeOffset occurredAtUtc) =>
        new(
            eventId,
            eventType,
            GameEventVisibilityScope.Player,
            playerId,
            correlationId,
            CausationId: null,
            RuleVersion: "persistence-v1",
            OccurredAtUtc: occurredAtUtc);
}
