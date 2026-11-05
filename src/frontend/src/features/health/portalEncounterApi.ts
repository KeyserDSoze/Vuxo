import { getApiBaseUrl } from '../character/appearance';

export type PortalEncounterStatus = {
  active: boolean;
  portalGrantId: string | null;
  expiresAtUtc: string | null;
};

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
  return response.json() as Promise<PortalEncounterStatus>;
}
