using Microsoft.EntityFrameworkCore;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// A reward is linked to a verified sequence completion only if the immutable
/// award's causation event IS that completion, its owner matches the viewer,
/// the grant's canonical item key and correlation match, and the separate
/// inventory.item_awarded audit confirms the same causation and correlation.
/// GrantId alone is not sufficient evidence of provenance.
/// No write, no synthetic reward, bounded to one history page.
/// </summary>
internal static class PortalRewardProvenanceReader
{
    public static async Task<IReadOnlyDictionary<(Guid EventId, Guid GrantId), string>> ForCompletionsAsync(
        VuxoDbContext db, string owner,
        IReadOnlyCollection<(Guid EventId, Guid GrantId)> completions,
        CancellationToken cancellationToken = default)
    {
        if (completions.Count == 0)
            return new Dictionary<(Guid EventId, Guid GrantId), string>();

        var eventIds = completions.Select(x => x.EventId).Distinct().ToArray();
        var permitted = completions.ToHashSet();

        var evidence = await (
            from award in db.PlayerInventoryAwards.AsNoTracking()
            join grant in db.ExclusiveContentGrants.AsNoTracking()
                on new { Id = award.GrantId, award.PlayerId }
                equals new { grant.Id, grant.PlayerId }
            join completionAudit in db.GameEvents.AsNoTracking()
                on award.CausationId equals completionAudit.EventId
            join awardAudit in db.GameEvents.AsNoTracking()
                on award.AwardEventId equals awardAudit.EventId
            where award.PlayerId == owner
                && grant.PlayerId == owner
                && eventIds.Contains(award.CausationId)
                && grant.ConsumedAtUtc != null
                && grant.RewardKey == award.ItemKey
                && grant.CorrelationId == award.CorrelationId
                && completionAudit.PlayerId == owner
                && completionAudit.EventType == "exclusive_content.consumed"
                && completionAudit.CausationId == grant.GrantEventId
                && completionAudit.CorrelationId == grant.CorrelationId
                && completionAudit.RuleVersion == grant.RuleVersion
                && awardAudit.PlayerId == owner
                && awardAudit.EventType == "inventory.item_awarded"
                && awardAudit.CausationId == completionAudit.EventId
                && awardAudit.CorrelationId == completionAudit.CorrelationId
            select new
            {
                award.GrantId,
                EventId = award.CausationId,
                award.ItemKey
            }).ToListAsync(cancellationToken);

        return evidence
            .Where(x => permitted.Contains((x.EventId, x.GrantId)))
            .ToDictionary(x => (x.EventId, x.GrantId), x => x.ItemKey);
    }
}
