import { useSyncExternalStore } from 'react'
import { subscribeToSessionChanges } from '../auth/authSession'
import { getAdminAccessState } from './adminAccess'

// A single reactive snapshot is shared by the shell and the protected admin route.
export function useAdminAccessState() {
  return useSyncExternalStore(subscribeToSessionChanges, getAdminAccessState)
}
