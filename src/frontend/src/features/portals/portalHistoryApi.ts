import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export type CompletedPortal = {
  grantId: string;
  contentKey: string;
  ruleVersion: string;
  grantedAtUtc: string;
  completedAtUtc: string;
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
