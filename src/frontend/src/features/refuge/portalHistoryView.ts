import type { HistoryEntry } from './portalHistoryPageMerge.ts';

/**
 * Presentation-only filters over receipts the current owner has already loaded.
 * This never queries the server or infers a reward from a Guardian outcome.
 * The client must still paginate to discover events not yet loaded.
 */
export type PortalHistoryViewFilter = 'all' | 'runes' | 'mistakes' | 'guardians' | 'rewards';

export function filterPortalHistoryEntries(
  entries: readonly HistoryEntry[], filter: PortalHistoryViewFilter, query: string,
): HistoryEntry[] {
  const needle = query.normalize('NFKC').trim().toLowerCase();
  return entries.filter(entry => {
    const kind = 'kind' in entry ? entry.kind : 'sequence_completed';
    if (filter === 'runes' && kind !== 'sequence_completed' ||
        filter === 'mistakes' && kind !== 'sequence_first_mistake' ||
        filter === 'guardians' && kind !== 'guardian_victory' && kind !== 'guardian_retreat' ||
        filter === 'rewards' && !entry.rewardItemKey) return false;
    if (!needle) return true;
    const fields = [entry.grantId, entry.contentKey, entry.ruleVersion,
      entry.rewardItemKey ?? '', 'eventId' in entry ? entry.eventId : ''];
    return fields.some(value => value.normalize('NFKC').toLowerCase().includes(needle));
  });
}
