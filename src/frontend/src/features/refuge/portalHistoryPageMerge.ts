import { compareServerTimestamps } from '../contracts/serverTimestamp.ts';
import type { CompletedPortal, PortalOutcome } from '../portals/portalHistoryContract.ts';

export type HistoryMode = 'completed' | 'outcomes';
export type HistoryEntry = CompletedPortal | PortalOutcome;

/**
 * Offset pages can change while another device completes a portal. A second
 * page is not part of the original snapshot just because its HTTP status is
 * 200. Reject duplicate identities and reversed chronology across boundaries
 * instead of publishing a false/mixed verified history in the Journal.
 *
 * The API orders by occurred-at descending, then internal event id. Ties are
 * valid (completed history intentionally does not expose private audit ids).
 * This is a fail-closed UI check, not transactional snapshot pagination.
 */
export function appendPortalHistoryPage(
  previous: readonly HistoryEntry[], incoming: readonly HistoryEntry[],
  mode: HistoryMode, page: number,
): HistoryEntry[] {
  const invalid = (): never => { throw new Error('portal_history_snapshot_changed'); };
  if (!Number.isInteger(page) || page < 1 || page > 1000) return invalid();
  if (page !== 1 && previous.length === 0) return invalid();

  const current = page === 1 ? [] : previous;
  const seen = new Set<string>();
  let previousInstant: string | null = null;

  for (const entry of [...current, ...incoming]) {
    const completed = mode === 'completed';
    if (completed ? 'kind' in entry : !('kind' in entry)) return invalid();
    const identity = (completed ? entry.grantId : (entry as PortalOutcome).eventId).toLowerCase();
    if (seen.has(identity)) return invalid();
    seen.add(identity);
    const instant = completed
      ? (entry as CompletedPortal).completedAtUtc
      : (entry as PortalOutcome).occurredAtUtc;
    if (previousInstant && compareServerTimestamps(instant, previousInstant) > 0)
      return invalid();
    previousInstant = instant;
  }
  return [...current, ...incoming];
}
