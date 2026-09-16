using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.PersonalContent;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class ExclusiveContentGrantRepository(VuxoDbContext dbContext) : IExclusiveContentGrantRepository
{
    public async Task AddAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
    {
        await dbContext.ExclusiveContentGrants.AddAsync(ToEntity(grant), cancellationToken);
    }

    public async Task UpdateAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.ExclusiveContentGrants
            .SingleAsync(x => x.Id == grant.Id && x.PlayerId == grant.PlayerId, cancellationToken);
        entity.ConsumedAtUtc = grant.ConsumedAtUtc;
    }

    public async Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableForPlayerAsync(
        string playerId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var entities = await dbContext.ExclusiveContentGrants
            .AsNoTracking()
            .Where(x =>
                x.PlayerId == playerId &&
                x.ConsumedAtUtc == null &&
                (x.ExpiresAtUtc == null || x.ExpiresAtUtc > now))
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return entities.Select(Rehydrate).ToArray();
    }

    public async Task<ExclusiveContentGrant?> GetByIdForPlayerAsync(
        Guid grantId,
        string playerId,
        CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.ExclusiveContentGrants
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == grantId && x.PlayerId == playerId, cancellationToken);

        return entity is null ? null : Rehydrate(entity);
    }

    private static ExclusiveContentGrantEntity ToEntity(ExclusiveContentGrant grant) => new()
    {
        Id = grant.Id,
        GrantEventId = grant.GrantEventId,
        SourceEventId = grant.SourceEventId,
        PlayerId = grant.PlayerId,
        ContentKey = grant.ContentKey,
        PortalKey = grant.PortalKey,
        DialogBranchKey = grant.DialogBranchKey,
        RewardKey = grant.RewardKey,
        Seed = grant.Seed,
        RuleVersion = grant.RuleVersion,
        CorrelationId = grant.CorrelationId,
        CausationId = grant.CausationId,
        CreatedAtUtc = grant.CreatedAtUtc,
        ExpiresAtUtc = grant.ExpiresAtUtc,
        ConsumedAtUtc = grant.ConsumedAtUtc
    };

    private static ExclusiveContentGrant Rehydrate(ExclusiveContentGrantEntity entity) =>
        ExclusiveContentGrant.Rehydrate(
            entity.Id,
            entity.GrantEventId,
            entity.SourceEventId,
            entity.PlayerId,
            entity.ContentKey,
            entity.PortalKey,
            entity.DialogBranchKey,
            entity.RewardKey,
            entity.Seed,
            entity.RuleVersion,
            entity.CorrelationId,
            entity.CausationId,
            entity.CreatedAtUtc,
            entity.ExpiresAtUtc,
            entity.ConsumedAtUtc);
}
