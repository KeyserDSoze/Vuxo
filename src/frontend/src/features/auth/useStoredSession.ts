import { useMemo, useSyncExternalStore } from 'react';
import {
  getStoredSessionSnapshot,
  subscribeToSessionChanges,
  type VuxoSession,
} from './authSession';

// useSyncExternalStore requires a referentially stable snapshot. Serialize
// the existing session contract rather than returning a new object each read.
function getSessionSnapshot(): string {
  return JSON.stringify(getStoredSessionSnapshot());
}

export function useStoredSession(): VuxoSession | null {
  const serialized = useSyncExternalStore(subscribeToSessionChanges, getSessionSnapshot);
  return useMemo(() => JSON.parse(serialized) as VuxoSession | null, [serialized]);
}
