using Vuxo.Domain.Events;

namespace Vuxo.Application.Events;

public sealed class GameEventAuditService(IGameEventStore eventStore)
{
    public const int DefaultLimit = 50;
    public const int MaximumLimit = 100;

    public Task<GameEventPage> QueryAsync(
        string? playerId,
        string? eventType,
        Guid? correlationId,
        DateTimeOffset? fromUtc,
        DateTimeOffset? toUtc,
        int offset,
        int limit,
        CancellationToken cancellationToken = default)
    {
        if (offset < 0) throw new ArgumentOutOfRangeException(nameof(offset));
        if (limit is < 1 or > MaximumLimit) throw new ArgumentOutOfRangeException(nameof(limit));
        if (fromUtc is { } from && toUtc is { } to && from > to)
        {
            throw new ArgumentException("fromUtc must be before or equal to toUtc.");
        }

        return eventStore.QueryAsync(
            new GameEventQuery(
                Normalize(playerId),
                Normalize(eventType),
                correlationId,
                fromUtc,
                toUtc,
                offset,
                limit),
            cancellationToken);
    }

    public async Task<GameEventRecord> GetByIdAsync(Guid eventId, CancellationToken cancellationToken = default)
    {
        if (eventId == Guid.Empty) throw new ArgumentException("Event id is required.", nameof(eventId));
        return await eventStore.GetByIdAsync(eventId, cancellationToken)
            ?? throw new KeyNotFoundException("Game event was not found.");
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
