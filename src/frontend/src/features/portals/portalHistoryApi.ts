import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';
import { parsePortalCompletionPage, parsePortalOutcomePage } from './portalHistoryContract';

export type {
  CompletedPortal, PortalCompletionPage, PortalOutcome,
  PortalOutcomeKind, PortalOutcomePage,
} from './portalHistoryContract';

/** Read-only owner history; never trust an unvalidated JSON response. */
export async function fetchCompletedPortals(
  page = 1, pageSize = 20, signal?: AbortSignal,
) {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new Error('portal_history_authentication_required');
  const response = await fetch(
    `${getApiBaseUrl()}/api/personal-content/history/completed?page=${page}&pageSize=${pageSize}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error('portal_history_request_failed');
  const raw: unknown = await response.json();
  return parsePortalCompletionPage(raw, page);
}

/**
 * A first mistake is not an aggregate of failed attempts, and a retreat
 * must not inherit a rune completion reward. Verify the server payload.
 */
export async function fetchPortalOutcomes(
  page = 1, pageSize = 20, signal?: AbortSignal,
) {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new Error('portal_history_authentication_required');
  const response = await fetch(
    `${getApiBaseUrl()}/api/personal-content/history/outcomes?page=${page}&pageSize=${pageSize}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!response.ok) throw new Error('portal_outcomes_request_failed');
  const raw: unknown = await response.json();
  return parsePortalOutcomePage(raw, page);
}
