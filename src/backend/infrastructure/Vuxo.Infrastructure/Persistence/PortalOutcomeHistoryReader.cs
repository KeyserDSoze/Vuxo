using Microsoft.EntityFrameworkCore;
using Vuxo.Application.PersonalContent;
using Vuxo.Domain.PersonalContent;
using Vuxo.Domain.Players;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Owner-bound UNION ALL of three verifiable event families. A failed answer
/// without a persisted damage receipt, an expired grant, and an unfinished
/// Guardian encounter are deliberately not asserted as resolved outcomes.
/// </summary>
public sealed class PortalOutcomeHistoryReader(VuxoDbContext db)
    : IPortalOutcomeHistoryReader
{
    private const string SequenceAuditPayload = """{"data":{"challengeType":"sequence"}}""";

    public async Task<PortalOutcomeHistoryPage> ListForPlayerAsync(
        string playerId, int page, int pageSize,
        CancellationToken cancellationToken = default,
        PortalHistoryPosition? after = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (page is < 1 or > 1000 || pageSize is < 1 or > 50)
            throw new ArgumentOutOfRangeException(nameof(page), "Pagination is restricted to page 1..1000 and pageSize 1..50.");

        var owner = playerId.Trim();

        // A consumed grant is NOT proof of a sequence win. Only an audited
        // server-verified challenge consumption supplies that evidence.
        var completions =
            from audit in db.GameEvents.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on audit.CausationId equals (Guid?)grant.GrantEventId
            where audit.PlayerId == owner
                && audit.EventType == "exclusive_content.consumed"
                && EF.Functions.JsonContains(audit.PayloadJson, SequenceAuditPayload)
                && grant.PlayerId == owner
                && grant.PortalKey == PortalSequenceRules.PortalKey
                && grant.ConsumedAtUtc != null
            select new
            {
                audit.EventId,
                GrantId = grant.Id,
                grant.ContentKey,
                Kind = PortalOutcomeKinds.SequenceCompleted,
                audit.RuleVersion,
                audit.OccurredAtUtc
            };

        // One canonical damage receipt per grant records the first incorrect
        // sequence consequence; it is not an aggregate of all failed answers.
        var mistakes =
            from mistake in db.PortalMistakeDamages.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = mistake.GrantId, mistake.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            join audit in db.GameEvents.AsNoTracking()
                on mistake.EventId equals audit.EventId
            where mistake.PlayerId == owner && grant.PlayerId == owner
                && grant.PortalKey == PortalSequenceRules.PortalKey
                && audit.PlayerId == owner
                && audit.EventType == "portal.sequence_mistake_damage"
                && audit.CausationId == grant.GrantEventId
            select new
            {
                audit.EventId,
                GrantId = grant.Id,
                grant.ContentKey,
                Kind = PortalOutcomeKinds.SequenceFirstMistake,
                audit.RuleVersion,
                audit.OccurredAtUtc
            };

        // Terminal PvE turn receipts are immutable and have the matching
        // server audit event. Retreat is NOT a sequence-challenge failure.
        var guardianTerminals =
            from turn in db.PortalGuardianTurns.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = turn.PortalGrantId, turn.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            join audit in db.GameEvents.AsNoTracking()
                on turn.TurnEventId equals audit.EventId
            where turn.PlayerId == owner && grant.PlayerId == owner
                && grant.PortalKey == PortalSequenceRules.PortalKey
                && audit.PlayerId == owner
                && audit.EventType == "portal.guardian_turn_resolved"
                && audit.CausationId == turn.EncounterEventId
                && (turn.Outcome == PortalGuardianRules.Victory ||
                    turn.Outcome == PortalGuardianRules.Retreat)
            select new
            {
                audit.EventId,
                GrantId = grant.Id,
                grant.ContentKey,
                Kind = turn.Outcome == PortalGuardianRules.Victory
                    ? PortalOutcomeKinds.GuardianVictory
                    : PortalOutcomeKinds.GuardianRetreat,
                audit.RuleVersion,
                audit.OccurredAtUtc
            };

        // UNION ALL remains fully SQL-side; row-value seek uses the same
        // (OccurredAtUtc, EventId) tie-break as the descending order.
        // Offset remains supported only for legacy page-based callers.
        var ordered = completions
            .Concat(mistakes)
            .Concat(guardianTerminals)
            .OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.EventId);
        var query = ordered.AsQueryable();
        if (after is { } position)
        {
            var when = position.OccurredAtUtc;
            var eventId = position.EventId;
            query = query.Where(row => EF.Functions.LessThan(
                ValueTuple.Create(row.OccurredAtUtc, row.EventId),
                ValueTuple.Create(when, eventId)));
        }
        else
        {
            query = query.Skip((page - 1) * pageSize);
        }

        var rows = await query.Take(pageSize + 1).ToListAsync(cancellationToken);

        var visibleRows = rows.Take(pageSize).ToArray();
        // Only successful sequence consumption events can be causally related
        // to canonical inventory grants. A Guardian victory/retreat is NOT
        // an inventory award and must not inherit a same-grant reward.
        var completedRows = visibleRows
            .Where(row => row.Kind == PortalOutcomeKinds.SequenceCompleted)
            .Select(row => (row.EventId, row.GrantId))
            .ToArray();
        var provenRewards = await PortalRewardProvenanceReader.ForCompletionsAsync(
            db, owner, completedRows, cancellationToken);

        return new PortalOutcomeHistoryPage(
            visibleRows.Select(row => new PortalOutcomeHistoryItem(
                row.EventId, row.GrantId, row.ContentKey, row.Kind,
                row.RuleVersion, row.OccurredAtUtc,
                row.Kind == PortalOutcomeKinds.SequenceCompleted
                    ? provenRewards.GetValueOrDefault((row.EventId, row.GrantId))
                    : null)).ToArray(),
            page, pageSize, rows.Count > pageSize,
            rows.Count > pageSize && visibleRows.Length > 0
                ? PortalHistoryCursor.Encode(new PortalHistoryPosition(
                    visibleRows[^1].OccurredAtUtc, visibleRows[^1].EventId))
                : null);
    }
}
