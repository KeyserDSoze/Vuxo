using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// PostgreSQL-backed owner history. The consumption event must carry the
/// canonical "sequence" challengeType and causally link to the original
/// grant. Legacy consumed grants without that audit proof are excluded.
/// </summary>
public sealed class PortalCompletionHistoryReader(VuxoDbContext dbContext)
    : IPortalCompletionHistoryReader
{
    private const string VerifiedSequencePayload = """{"data":{"challengeType":"sequence"}}""";

    public async Task<PortalCompletionHistoryPage> ListCompletedForPlayerAsync(
        string playerId, int page, int pageSize,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (page is < 1 or > 1000 || pageSize is < 1 or > 50)
            throw new ArgumentOutOfRangeException(nameof(page), "Page must be 1..1000 and pageSize 1..50.");

        var owner = playerId.Trim();
        var records =
            from eventRecord in dbContext.GameEvents.AsNoTracking()
            join grant in dbContext.ExclusiveContentGrants.AsNoTracking()
                on eventRecord.CausationId equals (Guid?)grant.GrantEventId
            where eventRecord.PlayerId == owner
                && eventRecord.EventType == "exclusive_content.consumed"
                && EF.Functions.JsonContains(eventRecord.PayloadJson, VerifiedSequencePayload)
                && grant.PlayerId == owner
                && grant.PortalKey == PortalSequenceRules.PortalKey
                && grant.ConsumedAtUtc != null
            orderby eventRecord.OccurredAtUtc descending, eventRecord.EventId descending
            select new
            {
                grant.Id,
                grant.ContentKey,
                grant.RuleVersion,
                grant.CreatedAtUtc,
                eventRecord.OccurredAtUtc
            };

        // Bounded offset pagination: deterministic ordering under a fixed
        // snapshot, limit 50/page and at most 1000 pages. Read-only.
        var rows = await records
            .Skip((page - 1) * pageSize)
            .Take(pageSize + 1)
            .ToListAsync(cancellationToken);

        return new PortalCompletionHistoryPage(
            rows.Take(pageSize).Select(row => new PortalCompletionHistoryItem(
                row.Id, row.ContentKey, row.RuleVersion,
                row.CreatedAtUtc, row.OccurredAtUtc)).ToArray(),
            page, pageSize, rows.Count > pageSize);
    }
}
