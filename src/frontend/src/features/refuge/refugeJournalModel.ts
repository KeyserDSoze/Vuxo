import type { InventoryAward } from '../inventory/inventoryApi';
import type { PortalGrant } from '../portals/portalApi';

export type JournalRewardFilter = 'all' | 'notConsumed' | 'consumed';

/** Pure read-only presentation helpers. Never infer a completed portal from a reward. */
export function journalRewards(
  rewards: readonly InventoryAward[], filter: JournalRewardFilter,
): InventoryAward[] {
  return rewards.filter(reward =>
    filter === 'all' ||
    (filter === 'consumed' ? reward.consumed === true : reward.consumed !== true)
  ).sort((a, b) => {
    const first = Date.parse(a.awardedAtUtc);
    const second = Date.parse(b.awardedAtUtc);
    const difference = (Number.isFinite(second) ? second : 0) -
      (Number.isFinite(first) ? first : 0);
    return difference || a.grantId.localeCompare(b.grantId);
  });
}

/** Active-only grants, earliest known expiry first, undated grants last. */
export function availableJournalPortals(grants: readonly PortalGrant[]): PortalGrant[] {
  return [...grants].sort((a, b) => {
    const aDate = a.expiresAtUtc ? Date.parse(a.expiresAtUtc) : NaN;
    const bDate = b.expiresAtUtc ? Date.parse(b.expiresAtUtc) : NaN;
    const aTime = Number.isFinite(aDate) ? aDate : Number.POSITIVE_INFINITY;
    const bTime = Number.isFinite(bDate) ? bDate : Number.POSITIVE_INFINITY;
    return aTime - bTime || a.id.localeCompare(b.id);
  });
}
