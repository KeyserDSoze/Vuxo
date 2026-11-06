import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';
import { parseCharacterItemHealResult, type CharacterItemHealResult } from '../contracts/ownerMutationContracts';
export type { CharacterItemHealResult } from '../contracts/ownerMutationContracts';

export class CharacterItemHealError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export async function consumeHealingItem(
  grantId: string, idempotencyKey: string, signal?: AbortSignal,
): Promise<CharacterItemHealResult> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new CharacterItemHealError('inventory_authentication_required', 401);
  const response = await fetch(
    getApiBaseUrl() + '/api/characters/me/heal/' + encodeURIComponent(grantId), {
      method: 'POST', cache: 'no-store', signal,
      headers: {
        Authorization: 'Bearer ' + token,
        'Idempotency-Key': idempotencyKey,
      },
    });
  if (!response.ok) {
    let code = 'heal_request_failed';
    try {
      const json = await response.json() as { code?: unknown };
      if (typeof json.code === 'string') code = json.code;
    } catch {
      // Transport failures retain the same key for safe retry.
    }
    throw new CharacterItemHealError(code, response.status);
  }
  return parseCharacterItemHealResult(await response.json() as unknown, grantId, idempotencyKey);
}
