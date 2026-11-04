import Phaser from 'phaser'
import type { WorldPlayerSnapshot, WorldRealtimeClient, WorldRealtimeState } from '../features/world/worldRealtime'
import type { WorldPortalMarker } from '../features/portals/portalApi'

const TILE_SIZE = 32

type PortalVisual = {
  ring: Phaser.GameObjects.Arc
  center: Phaser.GameObjects.Arc
}

type PlayerVisual = {
  body: Phaser.GameObjects.Rectangle
  name: Phaser.GameObjects.Text
  targetX: number
  targetY: number
}

export class WorldScene extends Phaser.Scene {
  private readonly players = new Map<string, PlayerVisual>()
  private readonly portalVisuals = new Map<string, PortalVisual>()
  private portals: WorldPortalMarker[] = []
  private ready = false
  private inputLocked = false
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private unsubscribe: (() => void) | null = null
  private selfPlayerId: string | null = null
  private cameraTargetId: string | null = null
  private lastHorizontal = 0
  private lastVertical = 0

  constructor(
    private readonly realtime: WorldRealtimeClient,
    private readonly onPortalClick?: (grantId: string) => void,
    private readonly onPortalsRendered?: (count: number) => void,
  ) {
    super('world')
  }

  create() {
    this.drawWorldGrid()
    this.ready = true
    this.drawPortals()
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

    this.unsubscribe = this.realtime.subscribe(state => this.applyState(state))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false
      this.realtime.setMovementIntent(0, 0)
      this.unsubscribe?.()
      this.unsubscribe = null
    })
  }

  setPortals(markers: readonly WorldPortalMarker[]): void {
    this.portals = [...markers]
    if (this.ready) this.drawPortals()
  }

  setInputLocked(locked: boolean): void {
    this.inputLocked = locked
    if (locked) {
      this.lastHorizontal = 0
      this.lastVertical = 0
      this.realtime.setMovementIntent(0, 0)
    }
  }

  private drawPortals(): void {
    const current = new Set(this.portals.map(portal => portal.id))
    for (const [id, visual] of this.portalVisuals) {
      if (current.has(id)) continue
      visual.ring.destroy()
      visual.center.destroy()
      this.portalVisuals.delete(id)
    }

    for (const portal of this.portals) {
      if (this.portalVisuals.has(portal.id)) continue
      const x = portal.x * TILE_SIZE
      const y = portal.y * TILE_SIZE
      const ring = this.add.circle(x, y, 19, 0x8b5cf6, 0.35)
        .setStrokeStyle(3, 0xe9d5ff, 1)
        .setDepth(6)
        .setInteractive({ useHandCursor: true })
      const center = this.add.circle(x, y, 8, 0xc084fc, 0.95).setDepth(7)
      ring.on('pointerdown', () => this.onPortalClick?.(portal.id))
      this.portalVisuals.set(portal.id, { ring, center })
    }
    this.onPortalsRendered?.(this.portalVisuals.size)
  }

  update(time: number, delta: number) {
    for (const visual of this.portalVisuals.values()) {
      visual.ring.setScale(1 + Math.sin(time / 300) * 0.08)
    }

    const horizontal = this.inputLocked ? 0 :
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0)
      - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0)
    const vertical = this.inputLocked ? 0 :
      (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0)
      - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0)

    if (horizontal !== this.lastHorizontal || vertical !== this.lastVertical) {
      this.lastHorizontal = horizontal
      this.lastVertical = vertical
      this.realtime.setMovementIntent(horizontal, vertical)
    }

    const interpolation = 1 - Math.exp(-delta / 80)
    for (const visual of this.players.values()) {
      visual.body.x = Phaser.Math.Linear(visual.body.x, visual.targetX, interpolation)
      visual.body.y = Phaser.Math.Linear(visual.body.y, visual.targetY, interpolation)
      visual.name.setPosition(visual.body.x, visual.body.y - 25)
    }
  }

  private applyState(state: WorldRealtimeState): void {
    this.selfPlayerId = state.selfPlayerId

    for (const playerId of [...this.players.keys()]) {
      if (!state.players.has(playerId)) this.removePlayer(playerId)
    }

    for (const player of state.players.values()) this.upsertPlayer(player)

    if (this.selfPlayerId && this.cameraTargetId !== this.selfPlayerId) {
      const self = this.players.get(this.selfPlayerId)
      if (self) {
        this.cameras.main.startFollow(self.body, true, 0.12, 0.12)
        this.cameras.main.setZoom(1)
        this.cameraTargetId = this.selfPlayerId
      }
    }
  }

  private upsertPlayer(player: WorldPlayerSnapshot): void {
    const targetX = player.x * TILE_SIZE
    const targetY = player.y * TILE_SIZE
    const existing = this.players.get(player.playerId)
    if (existing) {
      existing.targetX = targetX
      existing.targetY = targetY
      existing.name.setText(player.characterName)
      return
    }

    const isSelf = player.playerId === this.selfPlayerId
    const body = this.add.rectangle(
      targetX,
      targetY,
      22,
      28,
      isSelf ? 0xfbbf24 : 0x38bdf8,
    )
    body.setDepth(10)

    const name = this.add.text(targetX, targetY - 25, player.characterName, {
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      backgroundColor: '#0f172acc',
      padding: { x: 4, y: 2 },
    })
    name.setOrigin(0.5, 1)
    name.setDepth(11)

    this.players.set(player.playerId, { body, name, targetX, targetY })
  }

  private removePlayer(playerId: string): void {
    const visual = this.players.get(playerId)
    if (!visual) return
    visual.body.destroy()
    visual.name.destroy()
    this.players.delete(playerId)
    if (this.cameraTargetId === playerId) this.cameraTargetId = null
  }

  private drawWorldGrid(): void {
    const graphics = this.add.graphics()
    graphics.setDepth(-10)

    for (let tileX = -16; tileX < 48; tileX++) {
      for (let tileY = -16; tileY < 48; tileY++) {
        const shade = (tileX + tileY) % 2 === 0 ? 0x1e3a8a : 0x1e40af
        graphics.fillStyle(shade, 1)
        graphics.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1)
      }
    }
  }
}
