using Vuxo.Domain.Activities;

namespace Vuxo.Application.Activities;

/// <summary>Only JWT owner and keys/proof intentions enter the service.</summary>
public sealed class OffworldRunService(
    IOffworldRunRepository repository, TimeProvider clock)
{
    public Task<OffworldRunResult> StartAsync(string ownerId, string activityKey,
        Guid idempotencyKey, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        if (activityKey != OffworldRunRules.ActivityKey)
            throw new OffworldRunException(OffworldRunErrorCodes.InvalidActivity);
        if (idempotencyKey == Guid.Empty)
            throw new OffworldRunException(OffworldRunErrorCodes.KeyRequired);
        return repository.StartAsync(ownerId.Trim(), idempotencyKey,
            clock.GetUtcNow(), cancellationToken);
    }

    public Task<OffworldRunResult?> GetActiveAsync(string ownerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        return repository.GetActiveAsync(ownerId.Trim(), clock.GetUtcNow(), cancellationToken);
    }

    public Task<OffworldRunResult?> GetAsync(string ownerId, Guid runId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        return repository.GetAsync(ownerId.Trim(), runId,
            clock.GetUtcNow(), cancellationToken);
    }

    public Task<OffworldRunResult> CompleteAsync(string ownerId, Guid runId,
        Guid idempotencyKey, string? moves,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        if (idempotencyKey == Guid.Empty)
            throw new OffworldRunException(OffworldRunErrorCodes.KeyRequired);
        return repository.CompleteAsync(ownerId.Trim(), runId, idempotencyKey,
            moves, clock.GetUtcNow(), cancellationToken);
    }
}
