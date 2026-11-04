namespace Vuxo.Domain.Inventory;

public interface IPlayerInventoryRepository
{
    Task AddAsync(PlayerInventoryAward award, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PlayerInventoryAward>> GetForPlayerAsync(
        string playerId,
        CancellationToken cancellationToken = default);
}
