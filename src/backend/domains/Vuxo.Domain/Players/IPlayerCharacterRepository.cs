namespace Vuxo.Domain.Players;

public interface IPlayerCharacterRepository
{
    Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default);
    Task AddAsync(PlayerCharacter character, CancellationToken cancellationToken = default);
}
