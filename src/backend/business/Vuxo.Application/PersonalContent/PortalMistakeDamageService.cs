using Vuxo.Domain.Players;

namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Invoked only after ExclusiveContentService rejected a well-formed
/// sequence that does not match the canonical server-generated sequence.
/// </summary>
public sealed class PortalMistakeDamageService(
    IPortalMistakeDamageRepository repository, TimeProvider timeProvider)
{
    public Task<PortalMistakeDamageResult?> ApplyFirstMistakeAsync(
        string ownerId, Guid grantId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        if (grantId == Guid.Empty) throw new ArgumentException("Missing portal grant.", nameof(grantId));
        return repository.ApplyFirstMistakeAsync(ownerId.Trim(), grantId,
            timeProvider.GetUtcNow(), cancellationToken);
    }
}
