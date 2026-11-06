import { useEffect, useRef } from 'react';
import { readStoredSession } from './authSession';
import { createOwnerFocusGate } from './ownerFocusGate';

/**
 * Re-read owner data only when the tab becomes active again. The live session
 * must still match; avoid duplicate visibility/focus events and never race
 * a pending mutation. No timers, background polling or cross-account reads.
 */
export function useOwnerFocusRefresh(
  accessToken: string | null,
  refresh: () => void,
  canRefresh: () => boolean,
): void {
  const latest = useRef({ refresh, canRefresh });
  latest.current = { refresh, canRefresh };
  useEffect(() => {
    if (!accessToken) return;
    const gate = createOwnerFocusGate(accessToken);
    const onForeground = () => {
      if (!gate.shouldRefresh({
        token: readStoredSession()?.accessToken ?? null,
        visible: document.visibilityState === 'visible',
        busy: !latest.current.canRefresh(),
        now: Date.now(),
      })) return;
      latest.current.refresh();
    };
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [accessToken]);
}
