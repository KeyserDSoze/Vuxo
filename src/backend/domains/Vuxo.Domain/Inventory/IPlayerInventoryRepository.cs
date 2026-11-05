namespace Vuxo.Domain.Inventory;

public interface IPlayerInventoryRepository
{
    Task AddAsync(PlayerInventoryAward award, CancellationToken cancellationToken = default);

    // Award provenance/history remains immutable; availability filters spent receipts.
    // Default keeps existing in-memory test adapters compatible.
    // Useful for immutable award history views; spent grants remain traceable.
    Task<IReadOnlySet<Guid>> GetConsumedGrantIdsForPlayerAsync(
        string playerId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());

    Task<IReadOnlyList<PlayerInventoryAward>> GetUnspentForPlayerAsync(
        string playerId, CancellationToken cancellationToken = default) =>
        GetForPlayerAsync(playerId, cancellationToken);

    Task<IReadOnlyList<PlayerInventoryAward>> GetForPlayerAsync(
        string playerId,
        CancellationToken cancellationToken = default);
}
