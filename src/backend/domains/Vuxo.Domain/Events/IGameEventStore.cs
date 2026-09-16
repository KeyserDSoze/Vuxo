namespace Vuxo.Domain.Events;

public interface IGameEventStore
{
    Task AppendAsync(GameEventEnvelope envelope, string payloadJson, CancellationToken cancellationToken = default);

    Task<GameEventPage> QueryAsync(GameEventQuery query, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("This event store does not support audit queries.");

    Task<GameEventRecord?> GetByIdAsync(Guid eventId, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("This event store does not support audit queries.");
}
