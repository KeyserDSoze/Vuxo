namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>
/// One immutable start receipt, optionally followed by one completed receipt.
/// Expired runs remain for audit and never disappear from the history.
/// </summary>
public sealed class OffworldActivityRunEntity
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public required string PlayerId { get; set; }
    public required string ActivityKey { get; set; }
    public required string RulesVersion { get; set; }
    public int PuzzleIndex { get; set; }
    public Guid StartKey { get; set; }
    public Guid StartEventId { get; set; }
    public DateTimeOffset StartedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public required string State { get; set; }
    public Guid? FinishKey { get; set; }
    public Guid? FinishEventId { get; set; }
    public string? ProofHash { get; set; }
    public int? StepsChecked { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
}
