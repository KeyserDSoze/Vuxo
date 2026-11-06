import { getApiBaseUrl } from '../character/appearance';
import { parsePortalEncounterStatus, type PortalEncounterStatus } from '../contracts/ownerReadContracts';
export type { PortalEncounterStatus } from '../contracts/ownerReadContracts';

/**
 * Owner-only read model, never a client-controlled combat flag. The response
 * helps the UI explain disabled healing; only the server can enforce the lock.
 */
export async function fetchPortalEncounterStatus(
  accessToken: string, signal?: AbortSignal,
): Promise<PortalEncounterStatus> {
  const response = await fetch(getApiBaseUrl() + '/api/characters/me/encounter', {
    method: 'GET', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + accessToken },
    signal,
  });
  if (!response.ok) throw new Error('encounter_status_unavailable');
  return parsePortalEncounterStatus(await response.json() as unknown);
}
