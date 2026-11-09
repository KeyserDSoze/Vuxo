namespace Vuxo.Domain.Players;

// Owner-scoped compare-and-swap for cosmetic fields only.
public interface ICharacterAppearanceRepository
{
    Task<bool> TryUpdateAsync(
        string ownerId,
        long expectedRevision,
        CharacterAppearance appearance,
        CancellationToken cancellationToken = default);
}
