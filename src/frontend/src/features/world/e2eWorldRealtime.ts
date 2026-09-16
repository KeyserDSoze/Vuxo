import type {
  WorldConnectionStatus,
  WorldJoinResult,
  WorldPlayerSnapshot,
  WorldRealtimeClient,
  WorldRealtimeState,
} from './worldRealtime'

const POLL_INTERVAL_MS = 80
const RECONNECT_DELAY_MS = 200

export class E2EWorldRealtimeClient implements WorldRealtimeClient {
  private readonly listeners = new Set<(state: WorldRealtimeState) => void>()
  private readonly players = new Map<string, WorldPlayerSnapshot>()
  private readonly playerId = localStorage.getItem('vuxo.e2ePlayerId') ?? `e2e-${crypto.randomUUID()}`
  private readonly characterName = localStorage.getItem('vuxo.e2eCharacterName') ?? 'E2E Vuxian'
  private status: WorldConnectionStatus = 'idle'
  private errorCode: string | null = null
  private selfPlayerId: string | null = null
  private pollTimer: number | null = null
  private connected = false
  private readonly reconnectHandler = () => void this.simulateReconnect()

  constructor() {
    window.addEventListener('vuxo:e2e-reconnect', this.reconnectHandler)
  }

  async connect(): Promise<void> {
    if (this.connected) return
    this.setStatus('connecting')
    try {
      await this.join()
      this.connected = true
      this.startPolling()
    } catch {
      this.errorCode = 'world_connection_failed'
      this.setStatus('error')
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.stopPolling()
    window.removeEventListener('vuxo:e2e-reconnect', this.reconnectHandler)
    try {
      await fetch('/__vuxo_e2e/world/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId }),
        keepalive: true,
      })
    } catch {
      // Browser teardown may abort this request; test state is reset per scenario.
    }
    this.players.clear()
    this.selfPlayerId = null
    this.errorCode = null
    this.status = 'idle'
    this.emit()
  }

  setMovementIntent(horizontal: number, vertical: number): void {
    if (!this.connected || this.status !== 'connected') return
    void fetch('/__vuxo_e2e/world/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: this.playerId,
        horizontal: clampAxis(horizontal),
        vertical: clampAxis(vertical),
      }),
    })
  }

  subscribe(listener: (state: WorldRealtimeState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  getState(): WorldRealtimeState {
    return {
      status: this.status,
      selfPlayerId: this.selfPlayerId,
      players: new Map(this.players),
      errorCode: this.errorCode,
    }
  }

  private async join(): Promise<void> {
    const response = await fetch('/__vuxo_e2e/world/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: this.playerId, characterName: this.characterName }),
    })
    if (!response.ok) throw new Error(`e2e_join_${response.status}`)

    const result = await response.json() as WorldJoinResult
    this.players.clear()
    for (const player of result.players) this.players.set(player.playerId, player)
    this.players.set(result.self.playerId, result.self)
    this.selfPlayerId = result.self.playerId
    this.errorCode = null
    this.setStatus('connected')
  }

  private async poll(): Promise<void> {
    if (!this.connected) return
    try {
      const response = await fetch('/__vuxo_e2e/world/state', { cache: 'no-store' })
      if (!response.ok) throw new Error(`e2e_state_${response.status}`)
      const state = await response.json() as { players: WorldPlayerSnapshot[] }
      this.players.clear()
      for (const player of state.players) this.players.set(player.playerId, player)
      this.emit()
    } catch {
      this.errorCode = 'world_connection_failed'
      this.emit()
    } finally {
      this.startPolling()
    }
  }

  private startPolling(): void {
    if (!this.connected || this.pollTimer !== null) return
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = null
      void this.poll()
    }, POLL_INTERVAL_MS)
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) window.clearTimeout(this.pollTimer)
    this.pollTimer = null
  }

  private async simulateReconnect(): Promise<void> {
    if (!this.connected) return
    this.stopPolling()
    this.setStatus('reconnecting')
    await new Promise(resolve => window.setTimeout(resolve, RECONNECT_DELAY_MS))
    try {
      await this.join()
      this.startPolling()
    } catch {
      this.errorCode = 'world_reconnect_failed'
      this.setStatus('error')
    }
  }

  private setStatus(status: WorldConnectionStatus): void {
    this.status = status
    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}

function clampAxis(value: number): number {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}
