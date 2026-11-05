namespace Vuxo.Infrastructure.Persistence.Entities;

/// <summary>
/// One bounded active-encounter lease per character. Previous starts remain
/// in the immutable game event audit when a lease is replaced after expiry.
/// </summary>
public sealed class PortalEncounterStateEntity
{
    public Guid CharacterId { get; set; }
    public required string PlayerId { get; set; }
    public Guid PortalGrantId { get; set; }
    public Guid StartEventId { get; set; }
    public DateTimeOffset StartedAtUtc { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
}
