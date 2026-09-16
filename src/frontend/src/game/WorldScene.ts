import Phaser from 'phaser'
import type { WorldPlayerSnapshot, WorldRealtimeClient, WorldRealtimeState } from '../features/world/worldRealtime'

const TILE_SIZE = 32

type PlayerVisual = {
  body: Phaser.GameObjects.Rectangle
  name: Phaser.GameObjects.Text
  targetX: number
  targetY: number
}

export class WorldScene extends Phaser.Scene {
  private readonly players = new Map<string, PlayerVisual>()
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private unsubscribe: (() => void) | null = null
  private selfPlayerId: string | null = null
  private cameraTargetId: string | null = null
  private lastHorizontal = 0
  private lastVertical = 0

  constructor(private readonly realtime: WorldRealtimeClient) {
    super('world')
  }

  create() {
    this.drawWorldGrid()
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

    this.unsubscribe = this.realtime.subscribe(state => this.applyState(state))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.realtime.setMovementIntent(0, 0)
      this.unsubscribe?.()
      this.unsubscribe = null
    })
  }

  update(_time: number, delta: number) {
    const horizontal =
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0)
      - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0)
    const vertical =
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
