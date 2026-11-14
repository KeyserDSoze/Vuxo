using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Identity;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class VuxoIdentityRepository(VuxoDbContext dbContext) : IVuxoIdentityRepository
{
    public async Task<VuxoUser?> GetByExternalIdentityAsync(
        string provider,
        string subject,
        CancellationToken cancellationToken = default)
    {
        var identity = await dbContext.ExternalIdentities
            .AsNoTracking()
            .SingleOrDefaultAsync(
                x => x.Provider == provider && x.Subject == subject,
                cancellationToken);
        if (identity is null)
        {
            return null;
        }

        var user = await dbContext.VuxoUsers
            .AsNoTracking()
            .SingleAsync(x => x.Id == identity.VuxoUserId, cancellationToken);

        return Rehydrate(user);
    }

    public async Task<VuxoUser?> GetByVerifiedEmailAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var user = await dbContext.VuxoUsers
            .AsNoTracking()
            .Where(x => x.Email != null && x.Email.ToLower() == normalized)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return user is null ? null : Rehydrate(user);
    }

    public async Task LinkExternalIdentityAsync(
        VuxoUser user,
        string provider,
        string subject,
        DateTimeOffset linkedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var userEntity = await dbContext.VuxoUsers.SingleAsync(x => x.Id == user.Id, cancellationToken);
        userEntity.Email = user.Email;
        userEntity.LastLoginAtUtc = user.LastLoginAtUtc;

        await dbContext.ExternalIdentities.AddAsync(
            new ExternalIdentityEntity
            {
                Provider = provider,
                Subject = subject,
                VuxoUserId = user.Id,
                CreatedAtUtc = linkedAtUtc,
                LastLoginAtUtc = linkedAtUtc
            },
            cancellationToken);
    }

    public async Task AddAsync(
        VuxoUser user,
        string provider,
        string subject,
        DateTimeOffset linkedAtUtc,
        CancellationToken cancellationToken = default)
    {
        await dbContext.VuxoUsers.AddAsync(ToEntity(user), cancellationToken);
        await dbContext.ExternalIdentities.AddAsync(
            new ExternalIdentityEntity
            {
                Provider = provider,
                Subject = subject,
                VuxoUserId = user.Id,
                CreatedAtUtc = linkedAtUtc,
                LastLoginAtUtc = linkedAtUtc
            },
            cancellationToken);
    }

    public async Task UpdateLoginAsync(
        VuxoUser user,
        string provider,
        string subject,
        DateTimeOffset loginAtUtc,
        CancellationToken cancellationToken = default)
    {
        var userEntity = await dbContext.VuxoUsers.SingleAsync(x => x.Id == user.Id, cancellationToken);
        userEntity.DisplayName = user.DisplayName;
        userEntity.Email = user.Email;
        userEntity.LastLoginAtUtc = user.LastLoginAtUtc;

        var identity = await dbContext.ExternalIdentities.SingleAsync(
            x => x.Provider == provider && x.Subject == subject,
            cancellationToken);
        identity.LastLoginAtUtc = loginAtUtc;
    }

    private static VuxoUserEntity ToEntity(VuxoUser user) => new()
    {
        Id = user.Id,
        DisplayName = user.DisplayName,
        Email = user.Email,
        CreatedAtUtc = user.CreatedAtUtc,
        LastLoginAtUtc = user.LastLoginAtUtc
    };

    private static VuxoUser Rehydrate(VuxoUserEntity entity) =>
        VuxoUser.Rehydrate(
            entity.Id,
            entity.DisplayName,
            entity.Email,
            entity.CreatedAtUtc,
            entity.LastLoginAtUtc);
}
