using Vuxo.Domain.Players;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Turn intentions are playable only after a trusted, server-verified
/// WorldPortalService entry created the PostgreSQL encounter lease.
/// </summary>
public sealed class PortalGuardianService(
    IPortalGuardianRepository repository, TimeProvider timeProvider)
{
    public Task<PortalGuardianStatus?> GetAsync(
        string ownerId, Guid grantId, CancellationToken cancellationToken = default) =>
        repository.GetAsync(ownerId, grantId, timeProvider.GetUtcNow(), cancellationToken);

    public Task<IReadOnlyList<PortalGuardianHistoryEntry>?> GetHistoryAsync(
        string ownerId, Guid grantId, CancellationToken cancellationToken = default) =>
        repository.GetHistoryAsync(ownerId, grantId, timeProvider.GetUtcNow(), cancellationToken);

    public Task<PortalGuardianTurnResult> PlayAsync(
        string ownerId, Guid grantId, string action, int expectedTurn,
        Guid idempotencyKey, CancellationToken cancellationToken = default)
    {
        if (!PortalGuardianRules.IsAction(action))
            throw new PortalGuardianException(PortalGuardianErrorCodes.InvalidAction);
        if (expectedTurn < 0 || expectedTurn >= PortalGuardianRules.MaximumTurns)
            throw new PortalGuardianException(PortalGuardianErrorCodes.InvalidTurn);
        if (idempotencyKey == Guid.Empty)
            throw new PortalGuardianException(PortalGuardianErrorCodes.KeyRequired);
        return repository.PlayAsync(ownerId, grantId, action, expectedTurn,
            idempotencyKey, timeProvider.GetUtcNow(), cancellationToken);
    }
}
