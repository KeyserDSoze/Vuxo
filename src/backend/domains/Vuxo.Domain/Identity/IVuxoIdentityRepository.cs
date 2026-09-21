namespace Vuxo.Domain.Identity;

public interface IVuxoIdentityRepository
{
    Task<VuxoUser?> GetByExternalIdentityAsync(
        string provider,
        string subject,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        VuxoUser user,
        string provider,
        string subject,
        DateTimeOffset linkedAtUtc,
        CancellationToken cancellationToken = default);

    Task UpdateLoginAsync(
        VuxoUser user,
        string provider,
        string subject,
        DateTimeOffset loginAtUtc,
        CancellationToken cancellationToken = default);
}
