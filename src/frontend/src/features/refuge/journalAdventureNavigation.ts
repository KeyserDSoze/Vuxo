import type { AdventureHistoryMode } from './refugeAdventureOverview.ts';
import type { PortalHistoryViewFilter } from './portalHistoryView.ts';

export type AdventureMetricKey =
  | 'inventoryRecords' | 'availablePortals' | 'runeCompletions'
  | 'firstMistakes' | 'guardianVictories' | 'guardianRetreats' | 'linkedRewards';

export type JournalDestination =
  | { section: 'rewards' | 'portals'; headingId: string }
  | { section: 'history'; headingId: string;
      mode: AdventureHistoryMode; filter: PortalHistoryViewFilter };

/**
 * UI-only navigation map. No API calls, mutation or owner-independent state.
 * Guardian metrics require the all-outcomes reader; a linked reward always
 * navigates to audited rune completions, never an inventory inference.
 */
const destinations: Readonly<Record<AdventureMetricKey, JournalDestination>> = {
  inventoryRecords: { section: 'rewards', headingId: 'refuge-journal-rewards-title' },
  availablePortals: { section: 'portals', headingId: 'refuge-journal-portals-title' },
  runeCompletions: { section: 'history', headingId: 'refuge-journal-completed-title',
    mode: 'completed', filter: 'all' },
  firstMistakes: { section: 'history', headingId: 'refuge-journal-completed-title',
    mode: 'outcomes', filter: 'mistakes' },
  guardianVictories: { section: 'history', headingId: 'refuge-journal-completed-title',
    mode: 'outcomes', filter: 'victories' },
  guardianRetreats: { section: 'history', headingId: 'refuge-journal-completed-title',
    mode: 'outcomes', filter: 'retreats' },
  linkedRewards: { section: 'history', headingId: 'refuge-journal-completed-title',
    mode: 'completed', filter: 'rewards' },
};

export function journalDestinationForMetric(metric: AdventureMetricKey): JournalDestination {
  return destinations[metric];
}

export type JournalHistoryJump = {
  id: number;
  mode: AdventureHistoryMode;
  filter: PortalHistoryViewFilter;
};
