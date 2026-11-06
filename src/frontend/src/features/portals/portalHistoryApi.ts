import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

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

export async function fetchCompletedPortals(
  page = 1, pageSize = 20, signal?: AbortSignal,
): Promise<PortalCompletionPage> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new Error('portal_history_authentication_required');
  const response = await fetch(
    `${getApiBaseUrl()}/api/personal-content/history/completed?page=${page}&pageSize=${pageSize}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error('portal_history_request_failed');
  return response.json() as Promise<PortalCompletionPage>;
}

/**
 * Immutable, evidence-backed event timeline. A first-mistake damage receipt is
 * not a count of failed attempts; retreat is not a rune sequence failure.
 */
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

export async function fetchPortalOutcomes(
  page = 1, pageSize = 20, signal?: AbortSignal,
): Promise<PortalOutcomePage> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new Error('portal_history_authentication_required');
  const response = await fetch(
    `${getApiBaseUrl()}/api/personal-content/history/outcomes?page=${page}&pageSize=${pageSize}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error('portal_outcomes_request_failed');
  return response.json() as Promise<PortalOutcomePage>;
}
