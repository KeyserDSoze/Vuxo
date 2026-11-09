import type { InventoryAward } from '../inventory/inventoryApi';
import type { PortalGrant } from '../portals/portalApi';

export type JournalRewardFilter = 'all' | 'notConsumed' | 'consumed';
export type JournalRewardSort = 'newest' | 'oldest' | 'name';

export type JournalRewardBrowse = {
  query: string;
  sort: JournalRewardSort;
  locale: 'it' | 'en';
  itemLabel: (itemKey: string) => string;
};

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/** Pure, read-only presentation helpers: never infer a completed portal from a reward. */
export function journalRewards(
  rewards: readonly InventoryAward[], filter: JournalRewardFilter,
  browse?: JournalRewardBrowse,
): InventoryAward[] {
  const needle = normalizeSearch(browse?.query ?? '');
  const collator = new Intl.Collator(browse?.locale ?? 'it', { sensitivity: 'base', numeric: true });
  const itemLabel = browse?.itemLabel ?? ((key: string) => key);
  const dateValue = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const byRecent = (a: InventoryAward, b: InventoryAward) =>
    dateValue(b.awardedAtUtc) - dateValue(a.awardedAtUtc);

  return rewards.filter(reward => {
    if (filter === 'consumed' && reward.consumed !== true) return false;
    if (filter === 'notConsumed' && reward.consumed === true) return false;
    return !needle ||
      normalizeSearch(itemLabel(reward.itemKey)).includes(needle) ||
      normalizeSearch(reward.itemKey).includes(needle);
  }).sort((a, b) => {
    const chronological = byRecent(a, b);
    if (browse?.sort === 'oldest') return -chronological || a.grantId.localeCompare(b.grantId);
    if (browse?.sort === 'name') {
      return collator.compare(itemLabel(a.itemKey), itemLabel(b.itemKey)) ||
        chronological || a.grantId.localeCompare(b.grantId);
    }
    return chronological || a.grantId.localeCompare(b.grantId);
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
