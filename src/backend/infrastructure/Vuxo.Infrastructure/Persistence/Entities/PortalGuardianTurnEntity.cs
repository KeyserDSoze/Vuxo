namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>Immutable authoritative record of one showdown turn.</summary>
public sealed class PortalGuardianTurnEntity
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public required string PlayerId { get; set; }
    public Guid PortalGrantId { get; set; }
    public Guid EncounterEventId { get; set; }
    public Guid TurnEventId { get; set; }
    public Guid IdempotencyKey { get; set; }
    public int Turn { get; set; }
    public required string Action { get; set; }
    public required string GuardianAction { get; set; }
    public int PlayerHealthBefore { get; set; }
    public int PlayerHealthAfter { get; set; }
    public int PlayerMaxHealth { get; set; }
    public int GuardianHealthBefore { get; set; }
    public int GuardianHealthAfter { get; set; }
    public int GuardianMaxHealth { get; set; }
    public int DamageDealt { get; set; }
    public int DamageTaken { get; set; }
    public required string Outcome { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
}
