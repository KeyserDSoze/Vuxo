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
}
