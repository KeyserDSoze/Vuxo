namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class PlayerInventoryAwardEntity
{
    public Guid GrantId { get; set; }
    public Guid AwardEventId { get; set; }
    public required string PlayerId { get; set; }
    public required string ItemKey { get; set; }
    public DateTimeOffset AwardedAtUtc { get; set; }
    public Guid CorrelationId { get; set; }
    public Guid CausationId { get; set; }
}
