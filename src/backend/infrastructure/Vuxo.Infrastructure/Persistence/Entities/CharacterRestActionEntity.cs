namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>Append-only committed rest attempts; unique request id ensures replay safety.</summary>
public sealed class CharacterRestActionEntity
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public required string PlayerId { get; set; }
    public Guid IdempotencyKey { get; set; }
    public Guid EventId { get; set; }
    public int PreviousHealth { get; set; }
    public int CurrentHealth { get; set; }
    public int MaxHealth { get; set; }
    public int RestoredHealth { get; set; }
    public DateTimeOffset RestedAtUtc { get; set; }
}
