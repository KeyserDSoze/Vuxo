namespace Vuxo.Domain.Events;

public sealed record GameEventQuery(
    string? PlayerId = null,
    string? EventType = null,
    Guid? CorrelationId = null,
    DateTimeOffset? FromUtc = null,
    DateTimeOffset? ToUtc = null,
    int Offset = 0,
    int Limit = 50);

public sealed record GameEventRecord(
    GameEventEnvelope Envelope,
    string PayloadJson);

public sealed record GameEventPage(
    IReadOnlyList<GameEventRecord> Items,
    int Total,
    int Offset,
    int Limit);
