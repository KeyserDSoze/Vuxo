namespace Vuxo.Domain.Events;

public interface IGameEventStore
{
    Task AppendAsync(GameEventEnvelope envelope, string payloadJson, CancellationToken cancellationToken = default);
}
