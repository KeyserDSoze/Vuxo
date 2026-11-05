import { useCallback, useEffect, useState } from 'react';
import { fetchPortalEncounterStatus, type PortalEncounterStatus } from './portalEncounterApi';

/**
 * One shared read-only status hook for world/off-world actions.
 * A failed lookup does not authorize healing; the mutation endpoint always
 * rechecks the lock under PostgreSQL transaction and returns a stable 409.
 */
export function usePortalEncounterStatus(accessToken: string) {
  const [status, setStatus] = useState<PortalEncounterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setLoading(true);
    void fetchPortalEncounterStatus(accessToken, controller.signal)
      .then(value => { if (!controller.signal.aborted) setStatus(value); })
      .catch(() => { if (!controller.signal.aborted) setStatus(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, revision]);

  const refresh = useCallback(() => setRevision(value => value + 1), []);

  return { active: status?.active ?? false, loading, refresh };
}
