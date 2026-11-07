import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';
import {
  parseGuardianStatus, parseGuardianTurn, parseGuardianHistory,
  type GuardianAction, type GuardianStatus, type GuardianTurn, type GuardianHistoryEntry,
} from './guardianContracts.ts';
export type {
  GuardianAction, GuardianOutcome, GuardianStatus, GuardianTurn, GuardianHistoryEntry,
} from './guardianContracts.ts';

export class GuardianApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function request<T>(
  grantId: string, method: 'GET' | 'POST',
  data?: { action: GuardianAction; expectedTurn: number; key: string },
  signal?: AbortSignal,
  suffix = '',
): Promise<T> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new GuardianApiError('guardian_unavailable', 401);
  const url = getApiBaseUrl() +
    '/api/characters/me/portal-guardian/' + encodeURIComponent(grantId) +
    (data ? '/turn' : suffix);
  const response = await fetch(url, {
    method, cache: 'no-store', signal,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(data ? {
        'Content-Type': 'application/json',
        'Idempotency-Key': data.key,
      } : {}),
    },
    ...(data ? { body: JSON.stringify({
      action: data.action, expectedTurn: data.expectedTurn,
    }) } : {}),
  });
  if (!response.ok) {
    let code = 'guardian_request_failed';
    try {
      const payload = await response.json() as { code?: unknown };
      if (typeof payload.code === 'string') code = payload.code;
    } catch {
      // Preserve a stable fallback for transport/proxy failures.
    }
    throw new GuardianApiError(code, response.status);
  }
  return response.json() as Promise<T>;
}

export const fetchGuardian = async (
  grantId: string, signal?: AbortSignal,
): Promise<GuardianStatus> => parseGuardianStatus(
  await request<unknown>(grantId, 'GET', undefined, signal), grantId,
);

export const playGuardianTurn = async (
  grantId: string, action: GuardianAction, expectedTurn: number,
  key: string, signal?: AbortSignal,
): Promise<GuardianTurn> => parseGuardianTurn(
  await request<unknown>(grantId, 'POST', { action, expectedTurn, key }, signal),
  { grantId, action, expectedTurn, idempotencyKey: key },
);

// Only validated, privacy-minimal server projections are exposed to the UI.
export async function fetchGuardianHistory(
  grantId: string, signal?: AbortSignal,
): Promise<GuardianHistoryEntry[]> {
  return parseGuardianHistory(await request<unknown>(
    grantId, 'GET', undefined, signal, '/history',
  ));
}
