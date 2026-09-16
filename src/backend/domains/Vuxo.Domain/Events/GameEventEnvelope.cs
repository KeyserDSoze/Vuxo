namespace Vuxo.Domain.Events;

public enum GameEventVisibilityScope
{
    Global = 0,
    Party = 1,
    Player = 2,
    Administration = 3
}

public sealed record GameEventEnvelope(
    Guid EventId,
    string EventType,
    GameEventVisibilityScope VisibilityScope,
    string? PlayerId,
    Guid CorrelationId,
    Guid? CausationId,
    string RuleVersion,
    DateTimeOffset OccurredAtUtc)
{
    public static GameEventEnvelope Create(
        string eventType,
        GameEventVisibilityScope visibilityScope,
        string? playerId,
        string ruleVersion,
        Guid? correlationId = null,
        Guid? causationId = null) =>
        new(
            Guid.NewGuid(),
            eventType,
            visibilityScope,
            playerId,
            correlationId ?? Guid.NewGuid(),
            causationId,
            ruleVersion,
            DateTimeOffset.UtcNow);
}
