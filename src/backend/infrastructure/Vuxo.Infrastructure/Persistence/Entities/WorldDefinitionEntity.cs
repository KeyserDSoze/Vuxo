namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class WorldDefinitionEntity
{
    public required string WorldId { get; set; }
    public long Seed { get; set; }
    public int GeneratorVersion { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}
