using Vuxo.Domain.Players;

namespace Vuxo.Application.Players;

public sealed class CharacterHealingService(
    ICharacterHealingRepository repository, TimeProvider timeProvider)
{
    public Task<CharacterHealingResult> HealAsync(string playerId, Guid grantId,
        Guid idempotencyKey, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (idempotencyKey == Guid.Empty)
            throw new CharacterHealingException(CharacterHealingErrorCodes.InvalidKey);
        if (grantId == Guid.Empty)
            throw new CharacterHealingException(CharacterHealingErrorCodes.ItemNotOwned);
        return repository.HealAsync(playerId.Trim(), grantId, idempotencyKey,
            timeProvider.GetUtcNow(), cancellationToken);
    }
}
