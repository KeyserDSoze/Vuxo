using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Players;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>Call only AFTER the caller has locked the character row with FOR UPDATE.</summary>
internal static class PortalEncounterGuard
{
    public static async Task<bool> IsActiveAsync(
        VuxoDbContext db, Guid characterId, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var state = await (
            from encounter in db.PortalEncounterStates.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = encounter.PortalGrantId, encounter.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            where encounter.CharacterId == characterId
            select new { encounter.ExpiresAtUtc, grant.ConsumedAtUtc })
            .SingleOrDefaultAsync(cancellationToken);

        return state is not null && PortalEncounterRules.IsActive(
            now, state.ExpiresAtUtc, state.ConsumedAtUtc);
    }
}
