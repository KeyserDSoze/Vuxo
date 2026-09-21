namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class ExternalIdentityEntity
{
    public required string Provider { get; set; }
    public required string Subject { get; set; }
    public Guid VuxoUserId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset LastLoginAtUtc { get; set; }
}
