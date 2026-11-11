import { getApiBaseUrl } from '../character/appearance';
import type { VuxoSession } from './authSession';

export type SocialProviderConfiguration = {
  microsoft: {
    enabled: boolean;
    clientId: string | null;
    tenantId: string | null;
  };
  google: {
    enabled: boolean;
    clientId: string | null;
  };
};

export class AuthApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

// Retry only idempotent discovery for transient edge/gateway outages.
// Never repeat social credential exchange, logout or other mutations.
const DISCOVERY_RETRY_DELAYS_MS = [350, 900] as const;
const TRANSIENT_DISCOVERY_STATUSES = new Set([502, 503, 504]);

function waitForDiscoveryRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    // Close the race where a previous effect unmounts during registration.
    if (signal?.aborted) onAbort();
  });
}

export async function fetchSocialProviderConfiguration(
  signal?: AbortSignal,
): Promise<SocialProviderConfiguration> {
  for (let attempt = 0; attempt <= DISCOVERY_RETRY_DELAYS_MS.length; attempt += 1) {
    // Abort both the fetch and any pending retry on navigation/session change.
    signal?.throwIfAborted();
    const response = await fetch(`${getApiBaseUrl()}/api/auth/providers`, {
      cache: 'no-store',
      signal,
    });
    if (response.ok) return response.json() as Promise<SocialProviderConfiguration>;
    if (!TRANSIENT_DISCOVERY_STATUSES.has(response.status)
        || attempt === DISCOVERY_RETRY_DELAYS_MS.length) {
      throw new AuthApiError('social_provider_configuration_unavailable', response.status);
    }
    await waitForDiscoveryRetry(DISCOVERY_RETRY_DELAYS_MS[attempt], signal);
  }
  throw new AuthApiError('social_provider_configuration_unavailable', 503);
}

export async function exchangeSocialCredential(
  provider: 'microsoft' | 'google',
  credential: string,
): Promise<VuxoSession> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, credential }),
  });

  if (!response.ok) {
    let code = 'social_login_failed';
    try {
      const payload = await response.json() as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Keep stable generic error code when the upstream payload is unreadable.
    }
    throw new AuthApiError(code, response.status);
  }

  return response.json() as Promise<VuxoSession>;
}

export async function logoutVuxo(accessToken: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 401) {
    throw new AuthApiError('social_logout_failed', response.status);
  }
}
