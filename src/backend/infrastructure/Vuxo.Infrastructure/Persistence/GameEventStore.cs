using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Events;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class GameEventStore(VuxoDbContext dbContext) : IGameEventStore
{
    public async Task AppendAsync(GameEventEnvelope envelope, string payloadJson, CancellationToken cancellationToken = default)
    {
        var entity = new GameEventEntity
        {
            EventId = envelope.EventId,
            EventType = envelope.EventType,
            VisibilityScope = (int)envelope.VisibilityScope,
            PlayerId = envelope.PlayerId,
            CorrelationId = envelope.CorrelationId,
            CausationId = envelope.CausationId,
            RuleVersion = envelope.RuleVersion,
            OccurredAtUtc = envelope.OccurredAtUtc,
            PayloadJson = payloadJson
        };

        await dbContext.GameEvents.AddAsync(entity, cancellationToken);
    }

    public async Task<GameEventPage> QueryAsync(GameEventQuery query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        var events = ApplyFilters(dbContext.GameEvents.AsNoTracking(), query);
        var total = await events.CountAsync(cancellationToken);
        var items = await events
            .OrderByDescending(x => x.OccurredAtUtc)
            .ThenByDescending(x => x.EventId)
            .Skip(query.Offset)
            .Take(query.Limit)
            .ToListAsync(cancellationToken);

        return new GameEventPage(items.Select(ToRecord).ToArray(), total, query.Offset, query.Limit);
    }

    public async Task<GameEventRecord?> GetByIdAsync(Guid eventId, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.GameEvents
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.EventId == eventId, cancellationToken);
        return entity is null ? null : ToRecord(entity);
    }

    private static IQueryable<GameEventEntity> ApplyFilters(IQueryable<GameEventEntity> query, GameEventQuery filter)
    {
        if (!string.IsNullOrWhiteSpace(filter.PlayerId))
        {
            var playerId = filter.PlayerId.Trim();
            query = query.Where(x => x.PlayerId == playerId);
        }

        if (!string.IsNullOrWhiteSpace(filter.EventType))
        {
            var eventType = filter.EventType.Trim();
            query = query.Where(x => x.EventType == eventType);
        }

        if (filter.CorrelationId is { } correlationId)
        {
            query = query.Where(x => x.CorrelationId == correlationId);
        }

        if (filter.FromUtc is { } fromUtc)
        {
            query = query.Where(x => x.OccurredAtUtc >= fromUtc);
        }

        if (filter.ToUtc is { } toUtc)
        {
            query = query.Where(x => x.OccurredAtUtc <= toUtc);
        }

        return query;
    }

    private static GameEventRecord ToRecord(GameEventEntity entity) =>
        new(
            new GameEventEnvelope(
                entity.EventId,
                entity.EventType,
                (GameEventVisibilityScope)entity.VisibilityScope,
                entity.PlayerId,
                entity.CorrelationId,
                entity.CausationId,
                entity.RuleVersion,
                entity.OccurredAtUtc),
            entity.PayloadJson);
}
