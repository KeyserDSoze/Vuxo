namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>Unique grant-scoped receipt: one damage consequence per challenge.</summary>
public sealed class PortalMistakeDamageEntity
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public Guid GrantId { get; set; }
    public required string PlayerId { get; set; }
    public Guid EventId { get; set; }
    public int PreviousHealth { get; set; }
    public int CurrentHealth { get; set; }
    public int MaxHealth { get; set; }
    public int Damage { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
}
