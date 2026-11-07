import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export const PORTAL_SEQUENCE_KEY = 'challenge.sequence.v1';

export type PortalGrant = {
  id: string;
  contentKey: string;
  portalKey: string;
  expiresAtUtc: string | null;
};

/** World positions are projected by the server, never chosen by the browser. */
export type WorldPortalMarker = {
  id: string;
  contentKey: string;
  x: number;
  y: number;
};

export async function fetchWorldPortals(signal?: AbortSignal): Promise<WorldPortalMarker[]> {
  return portalRequest<WorldPortalMarker[]>(
    '/api/personal-content/world-portals', 'GET', undefined, signal
  );
}

export async function enterWorldPortal(grantId: string): Promise<WorldPortalMarker> {
  return portalRequest<WorldPortalMarker>(
    `/api/personal-content/world-portals/${encodeURIComponent(grantId)}/enter`,
    'POST',
  );
}

export type PortalChallenge = {
  grantId: string;
  version: string;
  sequence: string[];
};

export type PortalMistakeDamage = {
  damage: number;
  currentHealth: number;
  maxHealth: number;
  damageApplied: boolean;
};

export class PortalApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly mistakeDamage: PortalMistakeDamage | null = null,
  ) {
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
    let mistakeDamage: PortalMistakeDamage | null = null;
    try {
      const payload = await response.json() as {
        code?: unknown;
        damage?: unknown;
        currentHealth?: unknown;
        maxHealth?: unknown;
        damageApplied?: unknown;
      };
      if (typeof payload.code === 'string') code = payload.code;
      if (code === 'portal_challenge_incorrect' &&
          typeof payload.damage === 'number' &&
          typeof payload.currentHealth === 'number' &&
          typeof payload.maxHealth === 'number' &&
          typeof payload.damageApplied === 'boolean') {
        mistakeDamage = {
          damage: payload.damage,
          currentHealth: payload.currentHealth,
          maxHealth: payload.maxHealth,
          damageApplied: payload.damageApplied,
        };
      }
    } catch {
      // Keep the stable fallback error code for network/proxy responses.
    }
    throw new PortalApiError(code, response.status, mistakeDamage);
  }

  return response.json() as Promise<T>;
}

export async function fetchPortalGrants(signal?: AbortSignal): Promise<PortalGrant[]> {
  const grants = await portalRequest<PortalGrant[]>('/api/personal-content', 'GET', undefined, signal);
  return grants.filter(grant => grant.portalKey === PORTAL_SEQUENCE_KEY);
}

export function fetchPortalChallenge(grantId: string, signal?: AbortSignal): Promise<PortalChallenge> {
  return portalRequest<PortalChallenge>(
    `/api/personal-content/${encodeURIComponent(grantId)}/challenge`,
    'GET', undefined, signal,
  );
}

export function submitPortalChallenge(
  grantId: string, sequence: string[], signal?: AbortSignal,
): Promise<{ id: string; itemKey?: string | null }> {
  return portalRequest<{ id: string; itemKey?: string | null }>(
    `/api/personal-content/${encodeURIComponent(grantId)}/challenge/attempt`,
    'POST', sequence, signal,
  );
}
