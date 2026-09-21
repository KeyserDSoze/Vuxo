namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class VuxoUserEntity
{
    public Guid Id { get; set; }
    public required string DisplayName { get; set; }
    public string? Email { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset LastLoginAtUtc { get; set; }
}
