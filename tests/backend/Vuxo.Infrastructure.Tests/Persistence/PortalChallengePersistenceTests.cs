using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence;
using Xunit;

namespace Vuxo.Infrastructure.Tests.Persistence;

public sealed class PortalChallengePersistenceTests
{
    [PostgresIntegrationFact]
    public async Task ConcurrentGrantConsumption_OnlyOneRequestCanCommit()
    {
        await using var database = await PostgresDatabaseScope.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var grant = ExclusiveContentGrant.Create(
            Guid.NewGuid(), Guid.NewGuid(), "player-a", "portal.grove",
            PortalSequenceRules.PortalKey, "dialog-grove", "reward-grove",
            424242, "personal-content-v1", Guid.NewGuid(), null,
            now.AddMinutes(-1), now.AddHours(1));
        await using (var setup = database.CreateDbContext())
        {
            await setup.Database.MigrateAsync();
            await new ExclusiveContentGrantRepository(setup).AddAsync(grant);
            await setup.SaveChangesAsync();
        }

        await using var firstDb = database.CreateDbContext();
        await using var secondDb = database.CreateDbContext();
        var firstRepo = new ExclusiveContentGrantRepository(firstDb);
        var secondRepo = new ExclusiveContentGrantRepository(secondDb);
        var first = await firstRepo.GetByIdForPlayerAsync(grant.Id, "player-a");
        var second = await secondRepo.GetByIdForPlayerAsync(grant.Id, "player-a");
        Assert.NotNull(first);
        Assert.NotNull(second);
        Assert.True(first.TryConsume(now));
        Assert.True(second.TryConsume(now));
        await firstRepo.UpdateAsync(first);
        await secondRepo.UpdateAsync(second);

        await firstDb.SaveChangesAsync();
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => secondDb.SaveChangesAsync());

        await using var verification = database.CreateDbContext();
        var persisted = await new ExclusiveContentGrantRepository(verification)
            .GetByIdForPlayerAsync(grant.Id, "player-a");
        Assert.Equal(now, persisted?.ConsumedAtUtc);
        Assert.Null(await new ExclusiveContentGrantRepository(verification)
            .GetByIdForPlayerAsync(grant.Id, "player-b"));
    }
}
