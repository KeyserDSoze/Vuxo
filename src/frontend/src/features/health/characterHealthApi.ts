import { getApiBaseUrl } from '../character/appearance';
import { parseCharacterHealth, type CharacterHealth } from '../contracts/ownerReadContracts';
export type { CharacterHealth } from '../contracts/ownerReadContracts';

export class CharacterHealthApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

// Read-only. The server resolves the owner from the VUXO JWT; client values
// never become authoritative character health.
export async function fetchCharacterHealth(
  accessToken: string,
  signal?: AbortSignal,
): Promise<CharacterHealth> {
  const response = await fetch(getApiBaseUrl() + '/api/characters/me/health', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + accessToken },
    signal,
  });
  if (!response.ok) {
    throw new CharacterHealthApiError(
      response.status === 404 ? 'character_not_found' : 'health_unavailable',
      response.status,
    );
  }
  return parseCharacterHealth(await response.json() as unknown);
}
