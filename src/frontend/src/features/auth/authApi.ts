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

export async function fetchSocialProviderConfiguration(
  signal?: AbortSignal,
): Promise<SocialProviderConfiguration> {
  const response = await fetch(`${getApiBaseUrl()}/api/auth/providers`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new AuthApiError('social_provider_configuration_unavailable', response.status);
  return response.json() as Promise<SocialProviderConfiguration>;
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
