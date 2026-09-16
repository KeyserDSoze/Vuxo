import { E2EWorldRealtimeClient } from './e2eWorldRealtime'
import { SignalRWorldRealtimeClient, type WorldRealtimeClient } from './worldRealtime'

export function createWorldRealtimeClient(): WorldRealtimeClient {
  return import.meta.env.VITE_E2E_REALTIME === 'true'
    ? new E2EWorldRealtimeClient()
    : new SignalRWorldRealtimeClient()
}
