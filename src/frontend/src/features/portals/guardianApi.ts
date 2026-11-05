import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export type GuardianAction = 'strike' | 'guard';
export type GuardianOutcome = 'ongoing' | 'victory' | 'retreat';

export type GuardianStatus = {
  grantId: string;
  turn: number;
  guardianHealth: number;
  guardianMaxHealth: number;
  playerHealth: number;
  playerMaxHealth: number;
  outcome: GuardianOutcome;
  ruleVersion: string;
};
export type GuardianTurn = Omit<GuardianStatus, 'ruleVersion'> & {
  idempotencyKey: string;
  action: GuardianAction;
  guardianAction: GuardianAction;
  damageDealt: number;
  damageTaken: number;
  replayed: boolean;
};

export class GuardianApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function request<T>(
  grantId: string, method: 'GET' | 'POST',
  data?: { action: GuardianAction; expectedTurn: number; key: string },
  signal?: AbortSignal,
): Promise<T> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new GuardianApiError('guardian_unavailable', 401);
  const url = getApiBaseUrl() +
    '/api/characters/me/portal-guardian/' + encodeURIComponent(grantId) +
    (data ? '/turn' : '');
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
): Promise<GuardianStatus> => request(grantId, 'GET', undefined, signal);

export const playGuardianTurn = async (
  grantId: string, action: GuardianAction, expectedTurn: number,
  key: string, signal?: AbortSignal,
): Promise<GuardianTurn> => request(grantId, 'POST',
  { action, expectedTurn, key }, signal);
