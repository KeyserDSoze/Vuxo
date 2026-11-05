import { getApiBaseUrl } from '../character/appearance';

export type CharacterRestResult = {
  idempotencyKey: string;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
  restoredHealth: number;
  restedAtUtc: string;
  nextRestAtUtc: string;
  replayed: boolean;
};

export class CharacterRestApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly nextAllowedAtUtc?: string,
  ) {
    super(code);
  }
}

/**
 * Sends only an intention and a unique replay key.
 * Healing, cost, cooldown and state changes are decided on the server.
 */
export async function restCharacter(
  accessToken: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CharacterRestResult> {
  const response = await fetch(getApiBaseUrl() + '/api/characters/me/rest', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Idempotency-Key': idempotencyKey,
    },
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      code?: string; nextAllowedAtUtc?: string;
    } | null;
    throw new CharacterRestApiError(
      error?.code ?? 'rest_unavailable',
      response.status,
      error?.nextAllowedAtUtc,
    );
  }
  return response.json() as Promise<CharacterRestResult>;
}
