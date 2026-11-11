import Phaser from 'phaser'
import type { WorldPlayerSnapshot, WorldRealtimeClient, WorldRealtimeState } from '../features/world/worldRealtime'
import type { WorldPortalMarker } from '../features/portals/portalApi'
import { normalizeWorldPortalMarkers } from '../features/portals/worldPortalMarkers'
import { WORLD_ART_VERSION, createIllustratedWanderer, paintWoodlandLandmarks, paintWoodlandTile, readIllustratedWandererFacing, setIllustratedWandererFacing, setIllustratedWandererStride, type WandererFacing } from './WorldArtwork'
import { readWorldAppearance, worldAppearanceKey } from './WorldAppearance'
import { computeWorldCameraZoom } from './WorldCamera'
import { isWorldAvatarInView } from './WorldAvatarVisibility'
import { nextWorldTerrainWindow, type WorldTerrainWindow } from './WorldTerrainWindow'
import { createIllustratedPortal, destroyIllustratedPortal, updateIllustratedPortal, type IllustratedPortal } from './WorldPortalArtwork'

const TILE_SIZE = 32

type PlayerVisual = {
  body: Phaser.GameObjects.Container
  name: Phaser.GameObjects.Text
  targetX: number
  targetY: number
  appearanceKey: string
  facing: WandererFacing
  // Refresh only on *server* target changes, never from input events.
  // A short frame hold keeps animation visible between sparse realtime ticks.
  motionFrames: number
  walkedFrames: number
  reducedWalkFrames: number
}

export class WorldScene extends Phaser.Scene {
  private readonly players = new Map<string, PlayerVisual>()
  private readonly portalVisuals = new Map<string, IllustratedPortal>()
  private terrainGraphics: Phaser.GameObjects.Graphics | null = null
  private terrainWindow: WorldTerrainWindow | null = null
  private terrainRedraws = 0
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
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = motionPreference.matches
    const onMotionPreferenceChanged = (event: MediaQueryListEvent) => {
      this.reducedMotion = event.matches
    }
    motionPreference.addEventListener('change', onMotionPreferenceChanged)
    // Phaser does not emit object pointerout when the pointer exits the
    // *canvas*. Clear only decorative hover, never portal authorization.
    const clearPortalHoverOnCanvasExit = () => {
      for (const visual of this.portalVisuals.values()) visual.hovered = false
    }
    this.input.on(Phaser.Input.Events.GAME_OUT, clearPortalHoverOnCanvasExit)
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
      motionPreference.removeEventListener('change', onMotionPreferenceChanged)
      this.input.off(Phaser.Input.Events.GAME_OUT, clearPortalHoverOnCanvasExit)
      this.terrainGraphics = null
      this.terrainWindow = null
      this.terrainRedraws = 0
      for (const visual of this.portalVisuals.values()) destroyIllustratedPortal(visual)
      this.portalVisuals.clear()
      if (import.meta.env.VITE_E2E_REALTIME === 'true') {
        const host = document.querySelector('[data-testid="game-canvas"]')
        host?.removeAttribute('data-e2e-illustrated-player-count')
        host?.removeAttribute('data-e2e-world-art-version')
        host?.removeAttribute('data-e2e-avatar-appearance')
        host?.removeAttribute('data-e2e-avatar-facing')
        host?.removeAttribute('data-e2e-avatar-motion')
        host?.removeAttribute('data-e2e-name-label-bounds')
        host?.removeAttribute('data-e2e-visible-avatar-count')
        host?.removeAttribute('data-e2e-visible-avatar-ids')
        host?.removeAttribute('data-e2e-camera-zoom')
        host?.removeAttribute('data-e2e-world-coverage')
        host?.removeAttribute('data-e2e-terrain-redraws')
        host?.removeAttribute('data-e2e-woodland-landmarks')
        host?.removeAttribute('data-e2e-portal-art')
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
    const camera = this.cameras.main
    if (camera.width !== width || camera.height !== height) this.terrainWindow = null
    camera.setSize(width, height)
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
      this.terrainWindow = null
    }
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      document.querySelector('[data-testid="game-canvas"]')
        ?.setAttribute('data-e2e-camera-zoom', String(zoom))
    }
  }

  setPortals(markers: readonly WorldPortalMarker[]): void {
    // Defensive boundary for any non-HTTP callers of this scene: decorative
    // world objects must never be placed at coerced/null/infinite positions.
    this.portals = normalizeWorldPortalMarkers(markers)
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
      destroyIllustratedPortal(visual)
      this.portalVisuals.delete(id)
    }

    for (const portal of this.portals) {
      if (this.portalVisuals.has(portal.id)) continue
      const x = portal.x * TILE_SIZE
      const y = portal.y * TILE_SIZE
      // The API grants marker ownership; this decor never creates a portal.
      this.portalVisuals.set(portal.id, createIllustratedPortal(
        this, x, y, () => this.onPortalClick?.(portal.id),
      ))
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
      updateIllustratedPortal(visual, time, this.reducedMotion)
    }
    // Browser-only E2E geometry evidence; not present in production builds.
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      const visuals = [...this.portalVisuals.values()]
      document.querySelector('[data-testid="game-canvas"]')
        ?.setAttribute('data-e2e-portal-art', JSON.stringify({
          count: visuals.length,
          reducedMotion: this.reducedMotion,
          hitScales: visuals.map(visual => [visual.ring.scaleX, visual.ring.scaleY]),
          hitRadii: visuals.map(visual => visual.ring.radius),
          hovered: visuals.map(visual => visual.hovered),
          haloAlphas: visuals.map(visual => Math.round(visual.halo.alpha * 1000) / 1000),
          coreScales: visuals.map(visual => visual.center.scaleX),
        }))
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
    const motionEvidence: Array<{
      playerId: string
      moving: boolean
      bob: number
      walkedFrames: number
      reducedWalkFrames: number
    }> = []
    for (const [playerId, visual] of this.players) {
      visual.body.x = Phaser.Math.Linear(visual.body.x, visual.targetX, interpolation)
      visual.body.y = Phaser.Math.Linear(visual.body.y, visual.targetY, interpolation)
      const offsetX = visual.targetX - visual.body.x
      const offsetY = visual.targetY - visual.body.y
      // Facing is retained from authoritative target changes in upsertPlayer.
      // Interpolation and local keydown never create a turn.

      // Phaser can finish interpolating within a handful of frames even if
      // the authoritative mock only emits a single movement snapshot. Hold
      // a short decorative stride across render frames after a target change.
      // This is *not* client-predicted displacement or a gameplay timer.
      const remaining = Math.hypot(offsetX, offsetY)
      const moving = remaining > 0.75 || visual.motionFrames > 0
      const bob = setIllustratedWandererStride(
        visual.body, moving ? Math.max(remaining, 1) : 0, time, this.reducedMotion)
      visual.motionFrames = Math.max(0, visual.motionFrames - 1)
      if (import.meta.env.VITE_E2E_REALTIME === 'true') {
        if (bob > 0.25) visual.walkedFrames++
        if (moving && this.reducedMotion) visual.reducedWalkFrames++
        motionEvidence.push({
          playerId, moving, bob,
          walkedFrames: visual.walkedFrames, reducedWalkFrames: visual.reducedWalkFrames,
        })
      }
    }
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      document.querySelector('[data-testid="game-canvas"]')
        ?.setAttribute('data-e2e-avatar-motion', JSON.stringify(motionEvidence))
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
    const view = this.cameras.main.worldView
    // Keep all canonical player snapshots, camera tracking and radar data.
    // Only draw onscreen peer art and name labels. This prevents a dense
    // remote crowd from consuming text-layout work or shifting local labels.
    // The 128px overscan avoids flicker during interpolation/camera lerp.
    const onscreen: Array<[string, PlayerVisual]> = []
    for (const [playerId, visual] of this.players) {
      const visible = playerId === this.selfPlayerId ||
        isWorldAvatarInView(view, visual.body.x, visual.body.y)
      visual.body.setVisible(visible)
      visual.name.setVisible(visible)
      if (visible) onscreen.push([playerId, visual])
    }
    onscreen.sort(([idA, a], [idB, b]) =>
      a.body.y - b.body.y || a.body.x - b.body.x || idA.localeCompare(idB))

    for (const [playerId, visual] of onscreen) {
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
      host?.setAttribute('data-e2e-visible-avatar-count', String(onscreen.length))
      host?.setAttribute('data-e2e-visible-avatar-ids', JSON.stringify(
        onscreen.map(([playerId]) => playerId).sort()))
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
      host?.setAttribute('data-e2e-avatar-facing', JSON.stringify(
        [...this.players.entries()].map(([playerId, visual]) => ({
          playerId,
          ...readIllustratedWandererFacing(visual.body),
          scaleX: visual.body.scaleX,
        })).sort((a, b) => a.playerId.localeCompare(b.playerId))))
    }

    if (this.selfPlayerId && this.cameraTargetId !== this.selfPlayerId) {
      const self = this.players.get(this.selfPlayerId)
      if (self) {
        this.cameras.main.startFollow(self.body, true, 0.12, 0.12)
        // A first join should not spend seconds flying from world origin.
        // On later server-owned movement the follow camera still lerps.
        this.cameras.main.centerOn(self.body.x, self.body.y)
        this.terrainWindow = null
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
      // Sparse/irregular network snapshots should still yield a readable
      // gait, without inferring movement from untrusted local key presses.
      const dx = targetX - existing.targetX
      const dy = targetY - existing.targetY
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0.05) {
        existing.motionFrames = 12
        // The server's next position determines the art direction. It is not
        // predicted from key state, frame interpolation or camera motion.
        existing.facing = Math.abs(dx) >= Math.abs(dy)
          ? (dx < 0 ? 'west' : 'east')
          : (dy < 0 ? 'north' : 'south')
        setIllustratedWandererFacing(existing.body, existing.facing)
      }
      existing.targetX = targetX
      existing.targetY = targetY
      existing.name.setText(player.characterName)
      // Redraw only when a newer authoritative snapshot changes cosmetics;
      // movement deltas preserve the previous Phaser container and camera.
      if (existing.appearanceKey !== appearanceKey) {
        const old = existing.body
        const replacement = createIllustratedWanderer(this, player.playerId, isSelf, appearance)
        replacement.setPosition(old.x, old.y)
        setIllustratedWandererFacing(replacement, existing.facing)
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

    this.players.set(player.playerId, {
      body, name, targetX, targetY, appearanceKey, facing: 'south',
      motionFrames: 0, walkedFrames: 0, reducedWalkFrames: 0,
    })
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

    // The zoom-correct camera.worldView determines the coverage: scrollX/Y
    // are not the left/top when Phaser uses centered camera zoom.
    const view = this.cameras.main.worldView
    const next = nextWorldTerrainWindow(view, this.terrainWindow)
    if (next) {
      this.terrainWindow = next
      graphics.clear()
      this.terrainRedraws++
      for (let tileX = next.left; tileX <= next.right; tileX++) {
        for (let tileY = next.top; tileY <= next.bottom; tileY++) {
          paintWoodlandTile(graphics, tileX, tileY)
        }
      }
      // Landmark coordinates and drawing order are unchanged.
      const scenery = paintWoodlandLandmarks(graphics, next.left, next.top, next.right, next.bottom)
      if (import.meta.env.VITE_E2E_REALTIME === 'true') {
        document.querySelector('[data-testid="game-canvas"]')
          ?.setAttribute('data-e2e-woodland-landmarks', JSON.stringify(scenery))
      }
    }

    // Per-frame visible geometry is essential for coverage tests even if the
    // cached Graphics were not repainted. Neither attribute ships to prod.
    if (import.meta.env.VITE_E2E_REALTIME === 'true' && this.terrainWindow) {
      const { left, top, right, bottom } = this.terrainWindow
      const host = document.querySelector('[data-testid="game-canvas"]')
      host?.setAttribute('data-e2e-terrain-redraws', String(this.terrainRedraws))
      host?.setAttribute('data-e2e-world-coverage', JSON.stringify({
        drawnLeft: left * TILE_SIZE, drawnTop: top * TILE_SIZE,
        drawnRight: (right + 1) * TILE_SIZE, drawnBottom: (bottom + 1) * TILE_SIZE,
        visibleLeft: view.left, visibleTop: view.top,
        visibleRight: view.right, visibleBottom: view.bottom,
      }))
    }
  }
}
