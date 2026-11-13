import { cellNoise } from './WorldNoise'

// Decorative wildlife. A creature has no identity on the server, never blocks,
// never reacts to players and never appears in snapshots, radar or audit data.
// Its whole life is a pure function of its fixed home cell and the clock.
const TILE = 32
const MEADOW_WIDTH = 11
const MEADOW_HEIGHT = 9

export type CreatureKind = 'moth' | 'rabbit'
export type Creature = {
  key: string
  kind: CreatureKind
  homeX: number
  homeY: number
  radius: number
  seed: number
}

export type CreaturePose = {
  x: number
  y: number
  /** Vertical lift in pixels (hop or flutter) on top of `y`. */
  lift: number
  flipX: boolean
  /** 0..1 wing opening for moths; always 1 for rabbits. */
  flap: number
  moving: boolean
}

/** At most one creature per meadow cell, roughly two cells in three. */
export function creaturesInBounds(left: number, top: number, right: number, bottom: number): Creature[] {
  const creatures: Creature[] = []
  for (let cellX = Math.floor(left / MEADOW_WIDTH); cellX <= Math.floor(right / MEADOW_WIDTH); cellX++) {
    for (let cellY = Math.floor(top / MEADOW_HEIGHT); cellY <= Math.floor(bottom / MEADOW_HEIGHT); cellY++) {
      const seed = cellNoise(cellX + 31337, cellY - 1337)
      if (seed % 3 === 0) continue
      const kind: CreatureKind = (seed >>> 4) % 5 < 3 ? 'moth' : 'rabbit'
      creatures.push({
        key: `${cellX}:${cellY}:${kind}`,
        kind,
        homeX: (cellX * MEADOW_WIDTH + 2 + ((seed >>> 8) % (MEADOW_WIDTH - 4))) * TILE,
        homeY: (cellY * MEADOW_HEIGHT + 2 + ((seed >>> 12) % (MEADOW_HEIGHT - 4))) * TILE,
        radius: kind === 'moth' ? 70 + ((seed >>> 16) % 50) : 46 + ((seed >>> 16) % 34),
        seed,
      })
    }
  }
  return creatures
}

const RABBIT_CYCLE_MS = 6_500
const RABBIT_HOP_MS = 700

function rabbitSpot(creature: Creature, step: number): { x: number; y: number } {
  const n = cellNoise(creature.seed ^ step, step * 7 + 11)
  const angle = ((n % 360) * Math.PI) / 180
  const reach = creature.radius * (0.35 + ((n >>> 9) % 65) / 100)
  return { x: creature.homeX + Math.cos(angle) * reach, y: creature.homeY + Math.sin(angle) * reach * 0.6 }
}

/** Pure animation: same creature + same time always gives the same pose. */
export function creaturePose(creature: Creature, timeMs: number, reducedMotion: boolean): CreaturePose {
  const staticPose: CreaturePose = {
    x: creature.homeX, y: creature.homeY, lift: creature.kind === 'moth' ? -34 : 0,
    flipX: (creature.seed & 1) === 1, flap: 1, moving: false,
  }
  if (reducedMotion || !Number.isFinite(timeMs)) return staticPose

  if (creature.kind === 'moth') {
    const t = timeMs / 1000 + (creature.seed % 997)
    const x = creature.homeX + Math.cos(t * 0.45) * creature.radius
    const y = creature.homeY + Math.sin(t * 0.77) * creature.radius * 0.45
    return {
      x, y,
      lift: -30 + Math.sin(t * 2.1) * 9,
      flipX: -Math.sin(t * 0.45) < 0,
      flap: 0.35 + 0.65 * Math.abs(Math.sin(timeMs / 70 + creature.seed)),
      moving: true,
    }
  }

  const offset = timeMs + (creature.seed % RABBIT_CYCLE_MS)
  const step = Math.floor(offset / RABBIT_CYCLE_MS)
  const within = offset - step * RABBIT_CYCLE_MS
  const from = rabbitSpot(creature, step)
  const to = rabbitSpot(creature, step + 1)
  // Rest first and hop at the end of the cycle, so the next cycle starts exactly where this one lands.
  const hopStart = RABBIT_CYCLE_MS - RABBIT_HOP_MS
  if (within < hopStart) return { x: from.x, y: from.y, lift: 0, flipX: to.x < from.x, flap: 1, moving: false }
  const progress = (within - hopStart) / RABBIT_HOP_MS
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    lift: -Math.sin(progress * Math.PI) * 14,
    flipX: to.x < from.x,
    flap: 1,
    moving: true,
  }
}
