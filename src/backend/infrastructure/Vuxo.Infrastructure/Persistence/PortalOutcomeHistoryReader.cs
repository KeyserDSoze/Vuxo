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
        CancellationToken cancellationToken = default, string? cursor = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        if (page is < 1 or > 1000 || pageSize is < 1 or > 50)
            throw new ArgumentOutOfRangeException(nameof(page), "Pagination is restricted to page 1..1000 and pageSize 1..50.");

        if (cursor is not null && (page == 1 || !PortalHistoryCursor.TryDecode(cursor, out _)))
            throw new ArgumentException("Invalid history cursor.", nameof(cursor));
        PortalHistoryPosition? after = cursor is null ? null : PortalHistoryCursor.Decode(cursor);

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
                && audit.CorrelationId == grant.CorrelationId
                && audit.RuleVersion == grant.RuleVersion
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
                && audit.CorrelationId == grant.CorrelationId
                && audit.RuleVersion == PortalMistakeDamageRules.Version
            select new
            {
                audit.EventId,
                GrantId = grant.Id,
                grant.ContentKey,
                Kind = PortalOutcomeKinds.SequenceFirstMistake,
                audit.RuleVersion,
                audit.OccurredAtUtc
            };

        // Terminal PvE turn receipts need BOTH their audited turn and the
        // original audited encounter start, causally linked to this grant. Retreat is NOT a sequence-challenge failure.
        var guardianTerminals =
            from turn in db.PortalGuardianTurns.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = turn.PortalGrantId, turn.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            join audit in db.GameEvents.AsNoTracking()
                on turn.TurnEventId equals audit.EventId
            join encounterStart in db.GameEvents.AsNoTracking()
                on turn.EncounterEventId equals encounterStart.EventId
            where turn.PlayerId == owner && grant.PlayerId == owner
                && grant.PortalKey == PortalSequenceRules.PortalKey
                && audit.PlayerId == owner
                && audit.EventType == "portal.guardian_turn_resolved"
                && audit.CausationId == turn.EncounterEventId
                && audit.CorrelationId == grant.CorrelationId
                && (audit.RuleVersion == PortalGuardianRules.Version ||
                    audit.RuleVersion == PortalGuardianRules.CurrentVersion)
                && encounterStart.PlayerId == owner
                && encounterStart.EventType == "portal.encounter_started"
                && encounterStart.CausationId == grant.GrantEventId
                && encounterStart.CorrelationId == grant.CorrelationId
                && encounterStart.RuleVersion == PortalEncounterRules.Version
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

        // UNION ALL stays in PostgreSQL; cursor keeps the last public event
        // identity and 100ns UTC instant, so concurrent head inserts do not
        // change which older rows the next page returns.
        var records = completions.Concat(mistakes).Concat(guardianTerminals);
        if (after is { } position)
            records = records.Where(row => EF.Functions.LessThan(
                ValueTuple.Create(row.OccurredAtUtc, row.EventId),
                ValueTuple.Create(position.OccurredAtUtc, position.PublicId)));

        var ordered = records.OrderByDescending(row => row.OccurredAtUtc)
            .ThenByDescending(row => row.EventId);
        // Seek pages never emit OFFSET; keep Skip strictly on the bounded
        // legacy numbered-page path for backwards compatibility.
        var pageQuery = after is null && page > 1
            ? ordered.Skip((page - 1) * pageSize) : ordered;
        var rows = await pageQuery.Take(pageSize + 1).ToListAsync(cancellationToken);

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
                ? PortalHistoryCursor.Encode(visibleRows[^1].OccurredAtUtc, visibleRows[^1].EventId)
                : null);
    }
}
