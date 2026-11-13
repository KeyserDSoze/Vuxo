import { cellNoise } from './WorldNoise'

// Third-party scenery (Kenney "RPG pack", CC0) used as purely decorative,
// non-collidable props. Placement is a deterministic function of fixed tile
// coordinates, so every client sees the same woodland and nothing here is
// ever sent to, or accepted from, the server. Credits: docs/legal/asset-licenses.md.
export const SCENERY_ASSET_PATH = 'assets/third-party/kenney-rpg-pack/art/'
const TILE = 32

export type SceneryKind = 'tree' | 'sapling' | 'bush' | 'crate' | 'barrel' | 'fence'

export const SCENERY_FRAMES: Record<SceneryKind, readonly number[]> = {
  tree: [195, 196, 195, 196, 197, 199],
  sapling: [176, 178, 180],
  bush: [155, 156, 157, 158, 159, 160],
  crate: [163, 164],
  barrel: [183, 203],
  fence: [181, 201],
}
export const GROUND_FRAMES: readonly number[] = [3, 4, 39, 40]

export const sceneryTextureKey = (frame: number) => `kenney-rpg-${frame}`
export const sceneryFile = (frame: number) => `rpgTile${String(frame).padStart(3, '0')}.png`
export const groundTextureKey = sceneryTextureKey(GROUND_FRAMES[0])

/** Every frame the scene must preload, each exactly once. */
export function allSceneryFrames(): number[] {
  return [...new Set([...GROUND_FRAMES, ...Object.values(SCENERY_FRAMES).flat()])].sort((a, b) => a - b)
}

export type SceneryItem = {
  key: string
  kind: SceneryKind
  frame: number
  /** World pixels: the horizontal centre and the ground contact point. */
  x: number
  y: number
  scale: number
  flipX: boolean
}

function pick<T>(values: readonly T[], seed: number): T {
  return values[seed % values.length]
}

/**
 * Scenery for the inclusive tile rectangle. Sparse on purpose: the existing
 * woodland floor and landmarks stay readable and the cost stays bounded
 * (roughly one prop per ten tiles, even on ultrawide windows).
 */
export function sceneryInBounds(left: number, top: number, right: number, bottom: number): SceneryItem[] {
  const items: SceneryItem[] = []
  for (let tileX = left; tileX <= right; tileX++) {
    for (let tileY = top; tileY <= bottom; tileY++) {
      const n = cellNoise(tileX, tileY)
      const m = cellNoise(tileY + 7919, tileX - 104729)
      const baseX = tileX * TILE + TILE / 2 + ((n >>> 8) % 17) - 8
      const baseY = tileY * TILE + TILE - 2 + ((n >>> 13) % 5)
      const make = (kind: SceneryKind, scale: number, dx = 0, dy = 0, suffix = ''): SceneryItem => ({
        key: `${tileX}:${tileY}:${kind}${suffix}`,
        kind,
        frame: pick(SCENERY_FRAMES[kind], (n >>> 6) + suffix.length),
        x: baseX + dx,
        y: baseY + dy,
        scale,
        flipX: (m & 1) === 1,
      })

      if (n % 31 === 0) items.push(make('tree', 0.95 + (m % 4) * 0.12))
      else if (n % 41 === 1) items.push(make('sapling', 0.85 + (m % 3) * 0.1))
      else if (n % 29 === 2) items.push(make('bush', 0.7 + (m % 3) * 0.1))
      else if (n % 211 === 3) {
        // A tiny abandoned camp: a crate with a barrel beside it.
        items.push(make('crate', 0.85), make('barrel', 0.85, 22, 4, 'b'))
      } else if (n % 173 === 4) {
        // A short run of fence, always three pieces long and horizontal.
        items.push(make('fence', 0.9, -26, 0, 'a'), make('fence', 0.9, 0, 0, 'bb'), make('fence', 0.9, 26, 0, 'ccc'))
      }
    }
  }
  return items
}
