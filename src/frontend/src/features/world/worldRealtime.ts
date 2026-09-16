import * as signalR from '@microsoft/signalr'
import { getApiBaseUrl } from '../character/appearance'

export type WorldConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'

export type WorldPlayerSnapshot = {
  playerId: string
  characterId: string
  characterName: string
  x: number
  y: number
  speedMultiplier: number
  revision: number
}

export type WorldJoinResult = {
  self: WorldPlayerSnapshot
  players: WorldPlayerSnapshot[]
  isReconnect: boolean
  replacedConnectionId: string | null
}

export type WorldSimulationDelta = {
  tick: number
  players: WorldPlayerSnapshot[]
}

export type WorldRealtimeState = {
  status: WorldConnectionStatus
  selfPlayerId: string | null
  players: ReadonlyMap<string, WorldPlayerSnapshot>
  errorCode: string | null
}

export interface WorldRealtimeClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  setMovementIntent(horizontal: number, vertical: number): void
  subscribe(listener: (state: WorldRealtimeState) => void): () => void
  getState(): WorldRealtimeState
}

const ACCESS_TOKEN_STORAGE_KEY = 'vuxo.accessToken'
const MINIMUM_INTENT_INTERVAL_MS = 50

type MovementIntent = { horizontal: number; vertical: number }

export class SignalRWorldRealtimeClient implements WorldRealtimeClient {
  private readonly connection: signalR.HubConnection
  private readonly players = new Map<string, WorldPlayerSnapshot>()
  private readonly listeners = new Set<(state: WorldRealtimeState) => void>()
  private status: WorldConnectionStatus = 'idle'
  private selfPlayerId: string | null = null
  private errorCode: string | null = null
  private sequence = 0
  private desiredIntent: MovementIntent = { horizontal: 0, vertical: 0 }
  private sentIntent: MovementIntent = { horizontal: 0, vertical: 0 }
  private lastIntentAt = 0
  private intentTimer: number | null = null

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${getApiBaseUrl()}/hubs/world`, {
        accessTokenFactory: () => localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? '',
      })
      .withAutomaticReconnect([0, 500, 1500, 3000, 5000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    this.connection.on('world.playerJoined', (player: WorldPlayerSnapshot) => this.upsertPlayer(player))
    this.connection.on('world.playerUpdated', (player: WorldPlayerSnapshot) => this.upsertPlayer(player))
    this.connection.on('world.playerLeft', (player: WorldPlayerSnapshot) => {
      this.players.delete(player.playerId)
      this.emit()
    })
    this.connection.on('world.delta', (delta: WorldSimulationDelta) => {
      for (const player of delta.players) this.upsertPlayer(player, false)
      this.emit()
    })
    this.connection.on('world.sessionReplaced', () => {
      this.errorCode = 'world_session_replaced'
      this.setStatus('disconnected')
    })

    this.connection.onreconnecting(() => this.setStatus('reconnecting'))
    this.connection.onreconnected(() => void this.joinAfterReconnect())
    this.connection.onclose(() => {
      this.cancelIntentTimer()
      if (this.status !== 'idle') this.setStatus('disconnected')
    })
  }

  async connect(): Promise<void> {
    if (this.connection.state !== signalR.HubConnectionState.Disconnected) return

    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    if (!token) {
      this.errorCode = 'world_authentication_required'
      this.setStatus('error')
      return
    }

    this.errorCode = null
    this.setStatus('connecting')
    try {
      await this.connection.start()
      await this.joinWorld()
    } catch (error) {
      this.errorCode = readHubErrorCode(error) ?? 'world_connection_failed'
      this.setStatus('error')
      await this.safeStop()
    }
  }

  async disconnect(): Promise<void> {
    this.cancelIntentTimer()
    this.desiredIntent = { horizontal: 0, vertical: 0 }
    this.sentIntent = { horizontal: 0, vertical: 0 }

    if (this.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('LeaveWorld')
      } catch {
        // Disconnect must remain best-effort during navigation or transport loss.
      }
    }

    await this.safeStop()
    this.players.clear()
    this.selfPlayerId = null
    this.errorCode = null
    this.status = 'idle'
    this.emit()
  }

  setMovementIntent(horizontal: number, vertical: number): void {
    const next = {
      horizontal: clampAxis(horizontal),
      vertical: clampAxis(vertical),
    }

    if (next.horizontal === this.desiredIntent.horizontal && next.vertical === this.desiredIntent.vertical) return
    this.desiredIntent = next
    this.scheduleIntentFlush()
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

  private async joinWorld(): Promise<void> {
    const result = await this.connection.invoke<WorldJoinResult>('JoinWorld')
    this.players.clear()
    for (const player of result.players) this.players.set(player.playerId, player)
    this.selfPlayerId = result.self.playerId
    this.players.set(result.self.playerId, result.self)
    this.sequence = 0
    this.desiredIntent = { horizontal: 0, vertical: 0 }
    this.sentIntent = { horizontal: 0, vertical: 0 }
    this.lastIntentAt = 0
    this.errorCode = null
    this.setStatus('connected')
  }

  private async joinAfterReconnect(): Promise<void> {
    try {
      await this.joinWorld()
    } catch (error) {
      this.errorCode = readHubErrorCode(error) ?? 'world_reconnect_failed'
      this.setStatus('error')
    }
  }

  private scheduleIntentFlush(): void {
    if (this.status !== 'connected') return
    if (this.intentTimer !== null) return

    const elapsed = performance.now() - this.lastIntentAt
    const delay = Math.max(0, MINIMUM_INTENT_INTERVAL_MS - elapsed)
    this.intentTimer = window.setTimeout(() => {
      this.intentTimer = null
      void this.flushIntent()
    }, delay)
  }

  private async flushIntent(): Promise<void> {
    if (this.status !== 'connected') return
    if (sameIntent(this.desiredIntent, this.sentIntent)) return

    const intent = { ...this.desiredIntent }
    const sequence = ++this.sequence
    this.lastIntentAt = performance.now()

    try {
      await this.connection.invoke('SetMovementIntent', intent.horizontal, intent.vertical, sequence)
      this.sentIntent = intent
    } catch (error) {
      const code = readHubErrorCode(error)
      if (code === 'world_input_rate_limited') {
        this.scheduleIntentFlush()
        return
      }

      this.errorCode = code ?? 'world_input_rejected'
      this.emit()
    }

    if (!sameIntent(this.desiredIntent, this.sentIntent)) this.scheduleIntentFlush()
  }

  private upsertPlayer(player: WorldPlayerSnapshot, emit = true): void {
    const current = this.players.get(player.playerId)
    if (!current || player.revision >= current.revision) this.players.set(player.playerId, player)
    if (emit) this.emit()
  }

  private setStatus(status: WorldConnectionStatus): void {
    this.status = status
    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }

  private cancelIntentTimer(): void {
    if (this.intentTimer !== null) window.clearTimeout(this.intentTimer)
    this.intentTimer = null
  }

  private async safeStop(): Promise<void> {
    if (this.connection.state === signalR.HubConnectionState.Disconnected) return
    try {
      await this.connection.stop()
    } catch {
      // The connection may already be tearing down after a transport error.
    }
  }
}

export function createWorldRealtimeClient(): WorldRealtimeClient {
  return new SignalRWorldRealtimeClient()
}

function clampAxis(value: number): number {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

function sameIntent(left: MovementIntent, right: MovementIntent): boolean {
  return left.horizontal === right.horizontal && left.vertical === right.vertical
}

function readHubErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/world_[a-z0-9_]+/i)
  return match?.[0] ?? null
}
