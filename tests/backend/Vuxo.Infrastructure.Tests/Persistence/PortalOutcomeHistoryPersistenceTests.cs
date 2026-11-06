using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalOutcomeHistoryPersistenceTests
{
    [PostgresIntegrationFact]
    public async Task FirstMistakeAndSolvedSequence_AreDistinctVerifiedEventsWithoutCrossOwnerLeak()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;

        await using (var db = database.CreateDbContext())
        {
            var service = new PortalMistakeDamageRepository(db, new GameEventStore(db));
            var damage = await service.ApplyFirstMistakeAsync("player-a", grant.Id, now);
            Assert.NotNull(damage);
            Assert.True(damage.Applied);
        }

        await using (var db = database.CreateDbContext())
        {
            var service = new ExclusiveContentService(
                new ExclusiveContentGrantRepository(db), new GameEventStore(db),
                db, TimeProvider.System, new PlayerInventoryRepository(db));
            var answer = (await service.GetChallengeAsync("player-a", grant.Id)).Sequence;
            await service.SubmitChallengeAsync("player-a", grant.Id, answer);
        }

        await using var verification = database.CreateDbContext();
        var reader = new PortalOutcomeHistoryReader(verification);
        var page = await reader.ListForPlayerAsync("player-a", 1, 20);
        var events = page.Items;
        Assert.Equal(2, events.Count);
        Assert.Contains(events, x => x.Kind == PortalOutcomeKinds.SequenceFirstMistake);
        Assert.Contains(events, x => x.Kind == PortalOutcomeKinds.SequenceCompleted);
        Assert.All(events, x => Assert.Equal(grant.Id, x.GrantId));
        Assert.All(events, x => Assert.Equal("portal.grove", x.ContentKey));
        Assert.Equal(2, events.Select(x => x.EventId).Distinct().Count());
        Assert.False(page.HasMore);

        var firstPage = await reader.ListForPlayerAsync("player-a", 1, 1);
        var secondPage = await reader.ListForPlayerAsync("player-a", 2, 1);
        Assert.True(firstPage.HasMore);
        Assert.False(secondPage.HasMore);
        Assert.NotEqual(firstPage.Items[0].EventId, secondPage.Items[0].EventId);
        Assert.Empty((await reader.ListForPlayerAsync("player-b", 1, 20)).Items);

        // Receipt is grant-unique: replay cannot generate another first mistake.
        await using var repeatDb = database.CreateDbContext();
        var replay = await new PortalMistakeDamageRepository(repeatDb, new GameEventStore(repeatDb))
            .ApplyFirstMistakeAsync("player-a", grant.Id, now);
        Assert.Null(replay); // grant already consumed, no new receipt
    }

    [PostgresIntegrationFact]
    public async Task TerminalGuardianTurns_AreReportedOnlyOnceAfterVerifiedCombat()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var grant = await SeedAsync(database);
        var now = DateTimeOffset.UtcNow;
        await using (var db = database.CreateDbContext())
        {
            await new PortalEncounterRepository(db, new GameEventStore(db))
                .StartVerifiedPortalAsync("player-a", grant.Id, now);
        }

        string outcome = PortalGuardianRules.Ongoing;
        for (var turn = 0; turn < PortalGuardianRules.MaximumTurns && outcome == PortalGuardianRules.Ongoing; turn++)
        {
            await using var db = database.CreateDbContext();
            var receipt = await new PortalGuardianRepository(db, new GameEventStore(db))
                .PlayAsync("player-a", grant.Id,
                    PortalGuardianRules.Strike, turn, Guid.NewGuid(), now);
            outcome = receipt.Outcome;
        }

        Assert.Contains(outcome, new[] { PortalGuardianRules.Victory, PortalGuardianRules.Retreat });
        await using var verify = database.CreateDbContext();
        var history = new PortalOutcomeHistoryReader(verify);
        var result = await history.ListForPlayerAsync("player-a", 1, 20);
        var terminal = Assert.Single(result.Items);
        Assert.Equal(grant.Id, terminal.GrantId);
        Assert.Equal(
            outcome == PortalGuardianRules.Victory
                ? PortalOutcomeKinds.GuardianVictory : PortalOutcomeKinds.GuardianRetreat,
            terminal.Kind);
        Assert.Equal(PortalGuardianRules.CurrentVersion, terminal.RuleVersion);
        Assert.Empty((await history.ListForPlayerAsync("player-b", 1, 20)).Items);
    }

    private static async Task<ExclusiveContentGrant> SeedAsync(PostgresDatabaseScope database)
    {
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.grove",
            PortalSequenceRules.PortalKey, "dialog", "unsupported-reward",
            4242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using var db = database.CreateDbContext();
        await db.Database.MigrateAsync();
        await new ExclusiveContentGrantRepository(db).AddAsync(grant);
        await new PlayerCharacterRepository(db).AddAsync(PlayerCharacter.Create(
            "player-a", "Portal Explorer",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            new CharacterAppearance(
                "hair-1", "black", "face-1", "body-1", "skin-1",
                "blue", "shorts", "black", "shoe-1", "white")));
        await db.SaveChangesAsync();
        return grant;
    }
}
