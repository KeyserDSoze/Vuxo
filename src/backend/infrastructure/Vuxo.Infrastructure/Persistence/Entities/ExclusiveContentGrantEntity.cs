namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class ExclusiveContentGrantEntity
{
    public Guid Id { get; set; }
    public Guid GrantEventId { get; set; }
    public Guid SourceEventId { get; set; }
    public required string PlayerId { get; set; }
    public required string ContentKey { get; set; }
    public required string PortalKey { get; set; }
    public required string DialogBranchKey { get; set; }
    public required string RewardKey { get; set; }
    public long Seed { get; set; }
    public required string RuleVersion { get; set; }
    public Guid CorrelationId { get; set; }
    public Guid? CausationId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? ExpiresAtUtc { get; set; }
    public DateTimeOffset? ConsumedAtUtc { get; set; }
}
