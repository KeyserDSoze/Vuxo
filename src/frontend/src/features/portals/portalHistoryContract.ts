/**
 * Runtime contract for the owner-only history endpoints. Types alone cannot
 * protect a browser from malformed JSON returned by an outdated API or proxy.
 * Keep this module dependency-free so it can be tested without browser/CI.
 */
export type CompletedPortal = {
  grantId: string;
  contentKey: string;
  ruleVersion: string;
  grantedAtUtc: string;
  completedAtUtc: string;
  rewardItemKey?: string | null;
};

export type PortalCompletionPage = {
  items: CompletedPortal[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type PortalOutcomeKind =
  | 'sequence_completed'
  | 'sequence_first_mistake'
  | 'guardian_victory'
  | 'guardian_retreat';

export type PortalOutcome = {
  eventId: string;
  grantId: string;
  contentKey: string;
  kind: PortalOutcomeKind;
  ruleVersion: string;
  occurredAtUtc: string;
  rewardItemKey?: string | null;
};

export type PortalOutcomePage = {
  items: PortalOutcome[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const outcomeKinds: ReadonlySet<string> = new Set([
  'sequence_completed', 'sequence_first_mistake',
  'guardian_victory', 'guardian_retreat',
]);
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(): never {
  throw new Error('portal_history_invalid_response');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}

function guid(value: unknown): string {
  const stringValue = text(value);
  if (!guidPattern.test(stringValue)) return invalid();
  return stringValue;
}

function date(value: unknown): string {
  const stringValue = text(value);
  if (!Number.isFinite(Date.parse(stringValue))) return invalid();
  return stringValue;
}

function optionalReward(value: unknown): string | null {
  return value == null ? null : text(value);
}

function completed(value: unknown): CompletedPortal {
  const row = object(value);
  const grantedAtUtc = date(row.grantedAtUtc);
  const completedAtUtc = date(row.completedAtUtc);
  // A receipt cannot precede the server's original grant, even with differing offsets.
  if (Date.parse(completedAtUtc) < Date.parse(grantedAtUtc)) return invalid();
  return {
    grantId: guid(row.grantId),
    contentKey: text(row.contentKey),
    ruleVersion: text(row.ruleVersion),
    grantedAtUtc,
    completedAtUtc,
    rewardItemKey: optionalReward(row.rewardItemKey),
  };
}

function outcome(value: unknown): PortalOutcome {
  const row = object(value);
  const kind = text(row.kind);
  if (!outcomeKinds.has(kind)) return invalid();
  return {
    eventId: guid(row.eventId),
    grantId: guid(row.grantId),
    contentKey: text(row.contentKey),
    kind: kind as PortalOutcomeKind,
    ruleVersion: text(row.ruleVersion),
    occurredAtUtc: date(row.occurredAtUtc),
    // A mistake/Guardian result can never inherit a rune completion reward.
    rewardItemKey: kind === 'sequence_completed'
      ? optionalReward(row.rewardItemKey)
      : row.rewardItemKey == null ? null : invalid(),
  };
}

function page<T>(
  value: unknown, requestedPage: number,
  parseItem: (raw: unknown) => T, itemId: (item: T) => string,
): { items: T[]; page: number; pageSize: number; hasMore: boolean } {
  const data = object(value);
  if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000 ||
      data.page !== requestedPage || !Number.isInteger(data.pageSize) ||
      (data.pageSize as number) < 1 || (data.pageSize as number) > 50 ||
      typeof data.hasMore !== 'boolean' || !Array.isArray(data.items) ||
      data.items.length > (data.pageSize as number) ||
      (data.hasMore && data.items.length === 0)) return invalid();
  const items = data.items.map(parseItem);
  // GUID identity is case-insensitive, including for React list keys.
  if (new Set(items.map(item => itemId(item).toLowerCase())).size !== items.length) return invalid();
  return { items, page: requestedPage, pageSize: data.pageSize as number, hasMore: data.hasMore };
}

export function parsePortalCompletionPage(value: unknown, requestedPage: number): PortalCompletionPage {
  return page(value, requestedPage, completed, item => item.grantId);
}

export function parsePortalOutcomePage(value: unknown, requestedPage: number): PortalOutcomePage {
  return page(value, requestedPage, outcome, item => item.eventId);
}
