import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export const PORTAL_SEQUENCE_KEY = 'challenge.sequence.v1';

export type PortalGrant = {
  id: string;
  contentKey: string;
  portalKey: string;
  expiresAtUtc: string | null;
};

export type PortalChallenge = {
  grantId: string;
  version: string;
  sequence: string[];
};

export class PortalApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function portalRequest<T>(
  path: string, method: 'GET' | 'POST' = 'GET', sequence?: string[], signal?: AbortSignal
): Promise<T> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new PortalApiError('portal_authentication_required', 401);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(sequence ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(sequence ? { body: JSON.stringify({ sequence }) } : {}),
  });

  if (!response.ok) {
    let code = response.status === 401 ? 'portal_authentication_required' : 'portal_request_failed';
    try {
      const payload = await response.json() as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Keep the stable fallback error code for network/proxy responses.
    }
    throw new PortalApiError(code, response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchPortalGrants(signal?: AbortSignal): Promise<PortalGrant[]> {
  const grants = await portalRequest<PortalGrant[]>('/api/personal-content', 'GET', undefined, signal);
  return grants.filter(grant => grant.portalKey === PORTAL_SEQUENCE_KEY);
}

export function fetchPortalChallenge(grantId: string): Promise<PortalChallenge> {
  return portalRequest<PortalChallenge>(
    `/api/personal-content/${encodeURIComponent(grantId)}/challenge`
  );
}

export function submitPortalChallenge(grantId: string, sequence: string[]): Promise<{ id: string }> {
  return portalRequest<{ id: string }>(
    `/api/personal-content/${encodeURIComponent(grantId)}/challenge/attempt`,
    'POST', sequence,
  );
}
