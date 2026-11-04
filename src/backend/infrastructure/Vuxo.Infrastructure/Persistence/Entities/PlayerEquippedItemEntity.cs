namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class PlayerEquippedItemEntity
{
    public required string PlayerId { get; set; }
    public required string Slot { get; set; }
    public Guid GrantId { get; set; }
    public DateTimeOffset EquippedAtUtc { get; set; }
}
