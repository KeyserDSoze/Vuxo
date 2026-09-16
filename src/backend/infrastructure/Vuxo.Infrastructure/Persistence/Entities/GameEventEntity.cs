namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class GameEventEntity
{
    public Guid EventId { get; set; }
    public required string EventType { get; set; }
    public int VisibilityScope { get; set; }
    public string? PlayerId { get; set; }
    public Guid CorrelationId { get; set; }
    public Guid? CausationId { get; set; }
    public required string RuleVersion { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
    public required string PayloadJson { get; set; }
}
