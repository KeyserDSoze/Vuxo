namespace Vuxo.Domain.PersonalContent;

public interface IExclusiveContentGrantRepository
{
    Task AddAsync(ExclusiveContentGrant grant, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ExclusiveContentGrant>> GetAvailableForPlayerAsync(
        string playerId,
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    Task<ExclusiveContentGrant?> GetByIdForPlayerAsync(
        Guid grantId,
        string playerId,
        CancellationToken cancellationToken = default);
}
