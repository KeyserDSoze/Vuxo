using Vuxo.Domain.Players;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// The API may start an encounter ONLY after WorldPortalService.EnterAsync
/// confirms authenticated player, active owner grant, world presence and proximity.
/// Expires automatically; challenge consumption makes the lock inactive.
/// </summary>
public sealed class PortalEncounterService(
    IPortalEncounterRepository repository, TimeProvider timeProvider)
{
    public Task<PortalEncounterStatus> GetStatusAsync(
        string playerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        return repository.GetStatusAsync(
            playerId.Trim(), timeProvider.GetUtcNow(), cancellationToken);
    }

    public Task<PortalEncounterStatus> StartVerifiedPortalAsync(
        string playerId, Guid portalGrantId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (portalGrantId == Guid.Empty)
            throw new PortalEncounterException(PortalEncounterErrorCodes.InvalidPortal);
        return repository.StartVerifiedPortalAsync(
            playerId.Trim(), portalGrantId, timeProvider.GetUtcNow(), cancellationToken);
    }
}
