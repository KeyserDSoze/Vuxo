/**
 * Read-only, owner-scoped adventure snapshot. Every number comes from an
 * already validated server read; no local action or reward inference.
 * Null means unavailable/unloaded, never zero.
 */
export type AdventureHistoryMode = 'completed' | 'outcomes';
export type AdventureHistoryRow = {
  grantId: string;
  rewardItemKey?: string | null;
  kind?: 'sequence_completed' | 'sequence_first_mistake' | 'guardian_victory' | 'guardian_retreat';
};

export type AdventureHistorySnapshot = {
  mode: AdventureHistoryMode;
  loaded: number;
  hasMore: boolean;
  runeCompletions: number;
  firstMistakes: number | null;
  guardianVictories: number | null;
  guardianRetreats: number | null;
  linkedRewards: number;
};

export type AdventureOverview = {
  inventoryRecords: number | null;
  availablePortals: number | null;
  runeCompletions: number | null;
  firstMistakes: number | null;
  guardianVictories: number | null;
  guardianRetreats: number | null;
  linkedRewards: number | null;
  loadedEvents: number | null;
  hasMoreEvents: boolean | null;
  historyMode: AdventureHistoryMode | null;
};

export function summarizeAdventureHistory(
  rows: readonly AdventureHistoryRow[], mode: AdventureHistoryMode,
  hasMore: boolean,
): AdventureHistorySnapshot {
  const outcomes = mode === 'outcomes';
  const count = (kind: NonNullable<AdventureHistoryRow['kind']>) =>
    rows.filter(row => row.kind === kind).length;
  return {
    mode,
    loaded: rows.length,
    hasMore,
    runeCompletions: outcomes ? count('sequence_completed') : rows.length,
    firstMistakes: outcomes ? count('sequence_first_mistake') : null,
    guardianVictories: outcomes ? count('guardian_victory') : null,
    guardianRetreats: outcomes ? count('guardian_retreat') : null,
    // Only verified causal reward links from audit. Not inventory, not victories.
    linkedRewards: rows.filter(row => Boolean(row.rewardItemKey) &&
      (mode === 'completed' || row.kind === 'sequence_completed')).length,
  };
}

export function summarizeRefugeAdventure(
  inventory: readonly unknown[] | null,
  availablePortals: readonly unknown[] | null,
  history: AdventureHistorySnapshot | null,
): AdventureOverview {
  return {
    inventoryRecords: inventory === null ? null : inventory.length,
    availablePortals: availablePortals === null ? null : availablePortals.length,
    runeCompletions: history?.runeCompletions ?? null,
    firstMistakes: history?.firstMistakes ?? null,
    guardianVictories: history?.guardianVictories ?? null,
    guardianRetreats: history?.guardianRetreats ?? null,
    linkedRewards: history?.linkedRewards ?? null,
    loadedEvents: history?.loaded ?? null,
    hasMoreEvents: history?.hasMore ?? null,
    historyMode: history?.mode ?? null,
  };
}
