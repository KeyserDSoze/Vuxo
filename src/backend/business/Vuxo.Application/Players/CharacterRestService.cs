using Vuxo.Domain.Players;

namespace Vuxo.Application.Players;

/// <summary>
/// Orchestrates a rest intention. The PostgreSQL repository owns its row lock,
/// idempotency record, audit event and transaction as one atomic operation.
/// </summary>
public sealed class CharacterRestService(
    ICharacterRestRepository repository, TimeProvider timeProvider)
{
    public Task<CharacterRestResult> RestAsync(
        string ownerId, Guid idempotencyKey, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        if (idempotencyKey == Guid.Empty)
            throw new CharacterRestException(CharacterRestErrorCodes.InvalidIdempotencyKey);
        return repository.RestAsync(ownerId.Trim(), idempotencyKey,
            timeProvider.GetUtcNow(), cancellationToken);
    }
}
