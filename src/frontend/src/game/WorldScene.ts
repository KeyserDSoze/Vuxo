import Phaser from 'phaser'
import type { WorldPlayerSnapshot, WorldRealtimeClient, WorldRealtimeState } from '../features/world/worldRealtime'
import type { WorldPortalMarker } from '../features/portals/portalApi'
import { WORLD_ART_VERSION, createIllustratedWanderer, paintWoodlandTile } from './WorldArtwork'
import { readWorldAppearance, worldAppearanceKey } from './WorldAppearance'
import { computeWorldCameraZoom } from './WorldCamera'

const TILE_SIZE = 32

type PortalVisual = {
  ring: Phaser.GameObjects.Arc
  center: Phaser.GameObjects.Arc
  arch: Phaser.GameObjects.Graphics
}

type PlayerVisual = {
  body: Phaser.GameObjects.Container
  name: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  appearanceKey: string
}

export class WorldScene extends Phaser.Scene {
  private readonly players = new Map<string, PlayerVisual>()
  private readonly portalVisuals = new Map<string, PortalVisual>()
  private terrainGraphics: Phaser.GameObjects.Graphics | null = null
  private terrainBounds = ''
  private reducedMotion = false
  private portals: WorldPortalMarker[] = []
  private ready = false
  private inputLocked = false
  private inputSuspended = false
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
    private readonly onPortalScreenPosition?: (position: { x: number; y: number } | null) => void,
  ) {
    super('world')
  }

  create() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.terrainGraphics = this.add.graphics().setDepth(-10)
    this.updateCameraZoom(this.scale.width, this.scale.height)
    this.drawWorldGrid()
    this.ready = true
    this.drawPortals()
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

    this.unsubscribe = this.realtime.subscribe(state => this.applyState(state))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false
      this.terrainGraphics = null
      this.terrainBounds = ''
      if (import.meta.env.VITE_E2E_REALTIME === 'true') {
        const host = document.querySelector('[data-testid="game-canvas"]')
        host?.removeAttribute('data-e2e-illustrated-player-count')
        host?.removeAttribute('data-e2e-world-art-version')
        host?.removeAttribute('data-e2e-avatar-appearance')
        host?.removeAttribute('data-e2e-name-label-bounds')
        host?.removeAttribute('data-e2e-camera-zoom')
        host?.removeAttribute('data-e2e-world-coverage')
      }
      this.realtime.setMovementIntent(0, 0)
      this.unsubscribe?.()
      this.unsubscribe = null
    })
  }

  /**
   * Phaser uses the actual canvas parent size, not window.innerWidth.
   * ResizeObserver drives this for fullscreen, browser zoom and panels.
   */
  resizeViewport(width: number, height: number): void {
    if (width < 1 || height < 1) return
    this.cameras.main.setSize(width, height)
    this.updateCameraZoom(width, height)
    // Resizing from portrait to ultrawide changes camera-space geometry
    // drastically. Snap the existing follow target once; keep smooth lerp
    // only for subsequent player movement. No server position is modified.
    const self = this.selfPlayerId ? this.players.get(this.selfPlayerId) : null
    if (self && this.cameraTargetId === this.selfPlayerId)
      this.cameras.main.centerOn(self.body.x, self.body.y)
  }

  private updateCameraZoom(width: number, height: number): void {
    const zoom = computeWorldCameraZoom(width, height)
    if (this.cameras.main.zoom !== zoom) {
      this.cameras.main.setZoom(zoom)
      // The tile bounds are recalculated on the next world update; the
      // player follow target and all portal world coordinates are unchanged.
      this.terrainBounds = ''
    }
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      document.querySelector('[data-testid="game-canvas"]')
        ?.setAttribute('data-e2e-camera-zoom', String(zoom))
    }
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

  // Browser blur and hidden tabs can swallow the keyup event. Stop the
  // server-bound movement intention and clear Phaser's held-key state before
  // accepting a new keydown. This never changes an authoritative position.
  setWindowInputActive(active: boolean): void {
    this.inputSuspended = !active
    if (this.ready) this.input.keyboard?.resetKeys()
    this.lastHorizontal = 0
    this.lastVertical = 0
    this.realtime.setMovementIntent(0, 0)
  }

  private drawPortals(): void {
    const current = new Set(this.portals.map(portal => portal.id))
    for (const [id, visual] of this.portalVisuals) {
      if (current.has(id)) continue
      visual.ring.destroy()
      visual.center.destroy()
      visual.arch.destroy()
      this.portalVisuals.delete(id)
    }

    for (const portal of this.portals) {
      if (this.portalVisuals.has(portal.id)) continue
      const x = portal.x * TILE_SIZE
      const y = portal.y * TILE_SIZE
      // An illustrated stone arch behind the existing interactive portal ring.
      // Hit area and onPortalClick continue to use the original ring alone.
      const arch = this.add.graphics().setDepth(5)
      arch.lineStyle(6, 0x263f5d, 1)
      arch.strokeEllipse(x, y, 49, 66)
      arch.lineStyle(2, 0xc4a8ed, 0.92)
      arch.strokeEllipse(x, y, 40, 55)
      arch.fillStyle(0x9fe9e6, 0.95)
      arch.fillTriangle(x - 3, y - 35, x + 3, y - 35, x, y - 42)
      arch.fillStyle(0x405976, 1)
      arch.fillRoundedRect(x - 26, y + 22, 11, 7, 2)
      arch.fillRoundedRect(x + 15, y + 22, 11, 7, 2)
      const ring = this.add.circle(x, y, 19, 0x8b5cf6, 0.35)
        .setStrokeStyle(3, 0xe9d5ff, 1)
        .setDepth(6)
        .setInteractive({ useHandCursor: true })
      const center = this.add.circle(x, y, 8, 0xc084fc, 0.95).setDepth(7)
      ring.on('pointerdown', () => this.onPortalClick?.(portal.id))
      this.portalVisuals.set(portal.id, { ring, center, arch })
    }
    this.onPortalsRendered?.(this.portalVisuals.size)
  }

  update(time: number, delta: number) {
    this.drawWorldGrid()
    // The camera can still be following the player after the marker is drawn.
    // Expose its current screen position only to the Playwright test bridge.
    if (this.onPortalScreenPosition) {
      const portal = this.portals[0]
      if (!portal || !this.portalVisuals.has(portal.id)) {
        this.onPortalScreenPosition(null)
      } else {
        const camera = this.cameras.main
        // With zoom > 1 Phaser scrollX/scrollY are NOT the left/top of the
        // visible area: camera.worldView includes zoom about the center.
        const visible = camera.worldView
        this.onPortalScreenPosition({
          x: camera.x + (portal.x * TILE_SIZE - visible.left) * camera.zoom,
          y: camera.y + (portal.y * TILE_SIZE - visible.top) * camera.zoom,
        })
      }
    }
    for (const visual of this.portalVisuals.values()) {
      visual.ring.setScale(this.reducedMotion ? 1 : 1 + Math.sin(time / 300) * 0.08)
    }

    const keyboardBlocked = this.inputLocked || this.inputSuspended
    const horizontal = keyboardBlocked ? 0 :
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0)
      - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0)
    const vertical = keyboardBlocked ? 0 :
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
      const offset = visual.targetX - visual.body.x
      if (Math.abs(offset) > 2) visual.body.setScale(offset < 0 ? -1 : 1, 1)
    }
    this.layoutPlayerNameLabels()
  }

  /**
   * Give nearby player names separate lanes. This alters only Phaser text
   * positions: character coordinates, camera tracking and portal hit areas
   * remain controlled by existing world state.
   */
  private layoutPlayerNameLabels(): void {
    type Rect = { left: number; right: number; top: number; bottom: number }
    const placed: Rect[] = []
    const evidence: Array<Rect & { playerId: string }> = []
    const ordered = [...this.players.entries()].sort(([idA, a], [idB, b]) =>
      a.body.y - b.body.y || a.body.x - b.body.x || idA.localeCompare(idB))

    for (const [playerId, visual] of ordered) {
      const left = visual.body.x - visual.name.displayWidth / 2
      const right = visual.body.x + visual.name.displayWidth / 2
      const height = visual.name.displayHeight
      let bottom = visual.body.y - 54

      // Each conflict shifts the candidate above an already placed label.
      // The bounded search terminates even when many players share a tile.
      for (let attempts = 0; attempts <= placed.length; attempts++) {
        const top = bottom - height
        const conflict = placed.find(rect =>
          left < rect.right + 6 && right > rect.left - 6 &&
          top < rect.bottom + 6 && bottom > rect.top - 6)
        if (!conflict) break
        bottom = conflict.top - 6
      }

      const bounds = { left, right, top: bottom - height, bottom }
      visual.name.setPosition(visual.body.x, bottom)
      placed.push(bounds)
      if (import.meta.env.VITE_E2E_REALTIME === 'true') evidence.push({ playerId, ...bounds })
    }

    // E2E-only geometric evidence: assertions verify layout instead of only
    // checking name chips. Never expose a browser diagnostic in production.
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      const host = document.querySelector('[data-testid="game-canvas"]')
      host?.setAttribute('data-e2e-name-label-bounds', JSON.stringify(evidence))
    }
  }

  private applyState(state: WorldRealtimeState): void {
    this.selfPlayerId = state.selfPlayerId

    for (const playerId of [...this.players.keys()]) {
      if (!state.players.has(playerId)) this.removePlayer(playerId)
    }

    for (const player of state.players.values()) this.upsertPlayer(player)

    // Playwright-only proof that Phaser has actually constructed both illustrated
    // avatar containers. Presence chips and a canvas alone do not prove that.
    // These attributes are never emitted in the production realtime build.
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      const host = document.querySelector('[data-testid="game-canvas"]')
      host?.setAttribute('data-e2e-illustrated-player-count', String(this.players.size))
      host?.setAttribute('data-e2e-world-art-version', WORLD_ART_VERSION)
      host?.setAttribute('data-e2e-avatar-appearance', JSON.stringify(
        [...this.players.entries()].map(([playerId, visual]) =>
          ({ playerId, appearance: visual.appearanceKey })).sort((a, b) => a.playerId.localeCompare(b.playerId))))
    }

    if (this.selfPlayerId && this.cameraTargetId !== this.selfPlayerId) {
      const self = this.players.get(this.selfPlayerId)
      if (self) {
        this.cameras.main.startFollow(self.body, true, 0.12, 0.12)
        // A first join should not spend seconds flying from world origin.
        // On later server-owned movement the follow camera still lerps.
        this.cameras.main.centerOn(self.body.x, self.body.y)
        // Camera zoom is viewport-owned; joining or reconnecting must not
        // reset it to a fixed 1:1 desktop scale.
        this.cameraTargetId = this.selfPlayerId
      }
    }
  }

  private upsertPlayer(player: WorldPlayerSnapshot): void {
    const targetX = player.x * TILE_SIZE
    const targetY = player.y * TILE_SIZE
    const existing = this.players.get(player.playerId)
    const appearance = readWorldAppearance(player.appearance)
    const appearanceKey = worldAppearanceKey(appearance)
    const isSelf = player.playerId === this.selfPlayerId
    if (existing) {
      existing.targetX = targetX
      existing.targetY = targetY
      existing.name.setText(player.characterName)
      // Redraw only when a newer authoritative snapshot changes cosmetics;
      // movement deltas preserve the previous Phaser container and camera.
      if (existing.appearanceKey !== appearanceKey) {
        const old = existing.body
        const replacement = createIllustratedWanderer(this, player.playerId, isSelf, appearance)
        replacement.setPosition(old.x, old.y)
        replacement.setScale(old.scaleX, old.scaleY)
        existing.body = replacement
        existing.appearanceKey = appearanceKey
        if (this.cameraTargetId === player.playerId) {
          this.cameras.main.startFollow(replacement, true, 0.12, 0.12)
        }
        old.destroy()
      }
      return
    }

    // Only public cosmetics from the server-owned snapshot are rendered.
    // Old/mismatched versions keep the stable original illustrated fallback.
    const body = createIllustratedWanderer(this, player.playerId, isSelf, appearance)
    body.setPosition(targetX, targetY)
    const name = this.add.text(targetX, targetY - 54, player.characterName, {
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      backgroundColor: '#0c2234e8',
      padding: { x: 5, y: 3 },
    })
    name.setOrigin(0.5, 1)
    name.setDepth(11)

    this.players.set(player.playerId, { body, name, targetX, targetY, appearanceKey })
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
    const graphics = this.terrainGraphics
    if (!graphics) return

    // Terrain is a deterministic, decorative client surface. It does not
    // create collision, rewards, server-owned positions or world state.
    // Redraw only when the visible tile bounds change (including on resize).
    const camera = this.cameras.main
    // camera.scrollX/Y are not the visible top-left under centered zoom.
    // worldView is the true zoom-correct view rectangle, including camera
    // follow and RESIZE. Otherwise ultrawide gets blank right/bottom strips.
    const view = camera.worldView
    const left = Math.floor(view.left / TILE_SIZE) - 2
    const top = Math.floor(view.top / TILE_SIZE) - 2
    const right = Math.ceil(view.right / TILE_SIZE) + 2
    const bottom = Math.ceil(view.bottom / TILE_SIZE) + 2
    const bounds = `${left}:${top}:${right}:${bottom}`
    if (bounds === this.terrainBounds) return
    this.terrainBounds = bounds
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      document.querySelector('[data-testid="game-canvas"]')
        ?.setAttribute('data-e2e-world-coverage', JSON.stringify({
          drawnLeft: left * TILE_SIZE,
          drawnTop: top * TILE_SIZE,
          drawnRight: (right + 1) * TILE_SIZE,
          drawnBottom: (bottom + 1) * TILE_SIZE,
          visibleLeft: view.left, visibleTop: view.top,
          visibleRight: view.right, visibleBottom: view.bottom,
        }))
    }
    graphics.clear()

    for (let tileX = left; tileX <= right; tileX++) {
      for (let tileY = top; tileY <= bottom; tileY++) {
        paintWoodlandTile(graphics, tileX, tileY)
      }
    }
  }
}
