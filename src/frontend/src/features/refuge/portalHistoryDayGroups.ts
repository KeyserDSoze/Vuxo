import type { HistoryEntry } from './portalHistoryPageMerge.ts';

export type PortalHistoryDayGroup = {
  /** YYYY-MM-DD in the viewer's local calendar, not a server-side date. */
  key: string;
  label: string;
  items: HistoryEntry[];
};

/**
 * Presentation-only grouping of already validated, newest-first private audit
 * rows. Never reorder events, infer missing records, or read from the server.
 * A local calendar date may differ from the UTC date near midnight; using
 * formatToParts avoids locale-dependent string parsing and DST ambiguity.
 */
export function groupPortalHistoryByLocalDay(
  entries: readonly HistoryEntry[], locale: string, timeZone?: string,
): PortalHistoryDayGroup[] {
  const display = new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone,
  });
  const calendar = new Intl.DateTimeFormat('en-US', {
    calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  });
  const groups: PortalHistoryDayGroup[] = [];

  for (const entry of entries) {
    // API page parsing has already verified these canonical timestamps.
    const date = new Date('kind' in entry ? entry.occurredAtUtc : entry.completedAtUtc);
    const parts = Object.fromEntries(
      calendar.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(entry);
    } else {
      groups.push({ key, label: display.format(date), items: [entry] });
    }
  }
  return groups;
}
