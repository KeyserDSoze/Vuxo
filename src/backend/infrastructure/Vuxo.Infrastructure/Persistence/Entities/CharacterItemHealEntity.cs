namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>Immutable receipt of a healing use. Original award provenance is preserved.</summary>
public sealed class CharacterItemHealEntity
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public required string PlayerId { get; set; }
    public Guid GrantId { get; set; }
    public Guid IdempotencyKey { get; set; }
    public Guid EventId { get; set; }
    public int PreviousHealth { get; set; }
    public int CurrentHealth { get; set; }
    public int MaxHealth { get; set; }
    public int RestoredHealth { get; set; }
    public DateTimeOffset ConsumedAtUtc { get; set; }
}
