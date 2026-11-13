import Phaser from 'phaser'
import { AMBIENT_CYCLE_MS, REDUCED_MOTION_AMBIENT, ambientLight, ambientPhase, type AmbientLight } from './WorldAmbience'
import { creaturePose, creaturesInBounds, type Creature } from './WorldCreatures'

// Presentation-only atmosphere: time-of-day tint, fireflies, portal glow and
// sparks, plus decorative wildlife. Nothing here owns state that the server,
// radar, audit trail or any rule can observe, and nothing is interactive.
const TILE = 32
const GLOW = 'vuxo-glow'
const PIXEL = 'vuxo-pixel'
const MOTH = 'vuxo-moth'
const RABBIT = 'vuxo-rabbit'
const MAX_CREATURES = 28
const CREATURE_OVERSCAN = 96
const OVERLAY_DEPTH = 9.5

export type AtmospherePortal = { x: number; y: number; visible: boolean }

export type AtmosphereEvidence = {
  ambient: string
  tint: string
  reducedMotion: boolean
  creatures: number
  glows: number
  fireflies: boolean
}

export class WorldAtmosphere {
  private overlay: Phaser.GameObjects.Image | null = null
  private fireflies: Phaser.GameObjects.Particles.ParticleEmitter | null = null
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null
  private readonly glows: Phaser.GameObjects.Image[] = []
  private readonly creaturePool: Phaser.GameObjects.Image[] = []
  private creatures: Creature[] = []
  private creatureBounds = ''
  private lastSparkAt = 0
  private zoneKey = ''
  // The random zone reads this rectangle on every spawn, so resizing it resizes the zone.
  private readonly zoneRect = new Phaser.Geom.Rectangle(-480, -270, 960, 540)
  private ambient: AmbientLight = REDUCED_MOTION_AMBIENT
  private wasReduced: boolean | null = null

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.ensureTextures()
    this.overlay = this.scene.add.image(0, 0, PIXEL)
      .setDepth(OVERLAY_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY)
    this.fireflies = this.scene.add.particles(0, 0, GLOW, {
      lifespan: { min: 3500, max: 6500 },
      speed: { min: 3, max: 16 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.2, end: 0.03 },
      alpha: { start: 0.85, end: 0 },
      tint: [0x9ff0c8, 0xffe6a0, 0xb8f4ff],
      blendMode: 'ADD',
      frequency: 240,
      quantity: 1,
      emitZone: { type: 'random' as const, source: this.zoneRect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
    }).setDepth(9.8)
    this.sparks = this.scene.add.particles(0, 0, GLOW, {
      lifespan: 1100,
      speed: { min: 10, max: 34 },
      angle: { min: 250, max: 290 },
      gravityY: -18,
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xd7b6ff, 0x9ae6ee],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(9.7)
  }

  update(timeMs: number, view: Phaser.Geom.Rectangle, reducedMotion: boolean, portals: readonly AtmospherePortal[]): AtmosphereEvidence | null {
    const overlay = this.overlay
    if (!overlay) return null

    this.ambient = reducedMotion ? REDUCED_MOTION_AMBIENT : ambientLight(this.currentPhase())
    overlay.setPosition(view.centerX, view.centerY)
      .setDisplaySize(view.width + 192, view.height + 192)
      .setTint(this.ambient.color)

    this.updateFireflies(view, reducedMotion)
    this.updatePortalLight(timeMs, reducedMotion, portals)
    const creatureCount = this.updateCreatures(timeMs, view, reducedMotion)

    return {
      ambient: this.ambient.name,
      tint: '#' + this.ambient.color.toString(16).padStart(6, '0'),
      reducedMotion,
      creatures: creatureCount,
      glows: this.glows.filter(glow => glow.visible).length,
      fireflies: !reducedMotion,
    }
  }

  destroy(): void {
    this.overlay?.destroy()
    this.fireflies?.destroy()
    this.sparks?.destroy()
    for (const sprite of [...this.glows, ...this.creaturePool]) sprite.destroy()
    this.glows.length = 0
    this.creaturePool.length = 0
    this.overlay = null
    this.fireflies = null
    this.sparks = null
    this.creatures = []
    this.creatureBounds = ''
  }

  private currentPhase(): number {
    if (import.meta.env.VITE_E2E_REALTIME === 'true') {
      // Deterministic screenshots/tests; the key is absent in production builds.
      const forced = Number(window.localStorage.getItem('vuxo.e2eAmbientPhase'))
      if (window.localStorage.getItem('vuxo.e2eAmbientPhase') !== null && Number.isFinite(forced)) return ambientPhase(forced * AMBIENT_CYCLE_MS)
    }
    return ambientPhase(Date.now())
  }

  private ensureTextures(): void {
    const textures = this.scene.textures
    if (!textures.exists(PIXEL)) {
      const canvas = textures.createCanvas(PIXEL, 2, 2)
      if (canvas) {
        const context = canvas.getContext()
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, 2, 2)
        canvas.refresh()
      }
    }
    if (!textures.exists(GLOW)) {
      const canvas = textures.createCanvas(GLOW, 64, 64)
      if (canvas) {
        const context = canvas.getContext()
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
        gradient.addColorStop(0, 'rgba(255,255,255,1)')
        gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = gradient
        context.fillRect(0, 0, 64, 64)
        canvas.refresh()
      }
    }
    if (!textures.exists(MOTH)) {
      const g = this.scene.make.graphics({}, false)
      g.fillStyle(0xf3e6ff, 0.95)
      g.fillEllipse(4, 6, 8, 10)
      g.fillEllipse(12, 6, 8, 10)
      g.fillStyle(0xb99af0, 1)
      g.fillRect(7, 2, 2, 9)
      g.generateTexture(MOTH, 16, 12)
      g.destroy()
    }
    if (!textures.exists(RABBIT)) {
      const g = this.scene.make.graphics({}, false)
      g.fillStyle(0x0b1d2b, 0.5)
      g.fillEllipse(10, 14, 16, 5)
      g.fillStyle(0xcdbfae, 1)
      g.fillEllipse(10, 10, 15, 10)
      g.fillCircle(16, 7, 4)
      g.fillEllipse(15, 2, 3, 7)
      g.fillEllipse(18, 2, 3, 7)
      g.fillStyle(0xf4efe8, 1)
      g.fillCircle(3, 10, 2.4)
      g.fillStyle(0x1b2433, 1)
      g.fillCircle(17.5, 6.5, 0.9)
      g.generateTexture(RABBIT, 22, 18)
      g.destroy()
    }
  }

  private updateFireflies(view: Phaser.Geom.Rectangle, reducedMotion: boolean): void {
    const fireflies = this.fireflies
    if (!fireflies) return
    if (reducedMotion !== this.wasReduced) {
      this.wasReduced = reducedMotion
      if (reducedMotion) { fireflies.stop(); fireflies.killAll() } else fireflies.start()
    }
    if (reducedMotion) return
    fireflies.setPosition(view.centerX, view.centerY)
    const key = `${Math.round(view.width)}x${Math.round(view.height)}`
    if (key !== this.zoneKey) {
      this.zoneKey = key
      this.zoneRect.setTo(-view.width / 2, -view.height / 2, view.width, view.height)
    }
  }

  private updatePortalLight(timeMs: number, reducedMotion: boolean, portals: readonly AtmospherePortal[]): void {
    while (this.glows.length < portals.length) {
      this.glows.push(this.scene.add.image(0, 0, GLOW)
        .setDepth(9.6).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9d72f4))
    }
    const pulse = reducedMotion ? 0.5 : (1 + Math.sin(timeMs / 520)) / 2
    this.glows.forEach((glow, index) => {
      const portal = portals[index]
      glow.setVisible(Boolean(portal?.visible))
      if (!portal?.visible) return
      glow.setPosition(portal.x, portal.y - 4).setScale(2.3 + pulse * 0.35).setAlpha(0.32 + pulse * 0.2)
    })
    if (reducedMotion || !this.sparks || timeMs - this.lastSparkAt < 170) return
    this.lastSparkAt = timeMs
    for (const portal of portals) {
      if (!portal.visible) continue
      this.sparks.emitParticleAt(portal.x + Phaser.Math.Between(-12, 12), portal.y + 10, 1)
    }
  }

  private updateCreatures(timeMs: number, view: Phaser.Geom.Rectangle, reducedMotion: boolean): number {
    const left = Math.floor((view.left - CREATURE_OVERSCAN) / TILE)
    const top = Math.floor((view.top - CREATURE_OVERSCAN) / TILE)
    const right = Math.ceil((view.right + CREATURE_OVERSCAN) / TILE)
    const bottom = Math.ceil((view.bottom + CREATURE_OVERSCAN) / TILE)
    // A creature roams up to ~120px (4 tiles) from its home cell.
    const bounds = `${left - 4}:${top - 4}:${right + 4}:${bottom + 4}`
    if (bounds !== this.creatureBounds) {
      this.creatureBounds = bounds
      this.creatures = creaturesInBounds(left - 4, top - 4, right + 4, bottom + 4)
    }

    let used = 0
    for (const creature of this.creatures) {
      if (used >= MAX_CREATURES) break
      const pose = creaturePose(creature, timeMs, reducedMotion)
      const x = pose.x
      const y = pose.y + pose.lift
      if (x < view.left - CREATURE_OVERSCAN || x > view.right + CREATURE_OVERSCAN
        || y < view.top - CREATURE_OVERSCAN || y > view.bottom + CREATURE_OVERSCAN) continue

      let sprite = this.creaturePool[used]
      if (!sprite) {
        sprite = this.scene.add.image(0, 0, creature.kind === 'moth' ? MOTH : RABBIT)
        this.creaturePool.push(sprite)
      }
      const moth = creature.kind === 'moth'
      sprite.setTexture(moth ? MOTH : RABBIT)
        .setPosition(x, y)
        .setFlipX(pose.flipX)
        .setScale(moth ? 1.15 * pose.flap : 1.25, moth ? 1.15 : 1.25)
        .setVisible(true)
      // Moths glow above the night tint; rabbits sit in the dark with the scenery.
      sprite.setDepth(moth ? 9.7 : 4.6 + pose.y / 1_000_000)
      sprite.setBlendMode(moth ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      used++
    }
    for (let index = used; index < this.creaturePool.length; index++) this.creaturePool[index].setVisible(false)
    return used
  }
}
