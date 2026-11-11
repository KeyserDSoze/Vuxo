import Phaser from 'phaser'
import type { CharacterAppearanceDraft } from '../features/character/appearance'
import { PREVIEW_COLORS } from '../features/character/appearance'

// VUXO's first original procedural world art. These graphics are presentation
// only: no asset licence, gameplay collision, coordinates, economy or
// server-owned data are introduced. When provided, cosmetics are server-sourced.
export const WORLD_ART_VERSION = 'vuxo-world-art-v4'
export type WandererFacing = 'north' | 'south' | 'east' | 'west'
const TILE = 32

type CloakPalette = {
  robe: number
  shadow: number
  trim: number
  mantle: number
  hair: number
}

// Object references are weak so a Phaser scene's destroyed avatars do not
// survive a reconnect, new cosmetics or route navigation.
const wandererMotion = new WeakMap<Phaser.GameObjects.Container, {
  gait: Phaser.GameObjects.Container
  trail: Phaser.GameObjects.Ellipse
  front: Phaser.GameObjects.Graphics
  profile: Phaser.GameObjects.Graphics
  rear: Phaser.GameObjects.Graphics
  facing: WandererFacing
}>()

/** Update only the drawing orientation, never the authoritative world anchor. */
export function setIllustratedWandererFacing(avatar: Phaser.GameObjects.Container, facing: WandererFacing): void {
  const layer = wandererMotion.get(avatar)
  if (!layer) return
  layer.facing = facing
  layer.front.visible = facing === 'south'
  layer.rear.visible = facing === 'north'
  layer.profile.visible = facing === 'east' || facing === 'west'
  // Both profiles are drawn once; the west profile is a mirror of east.
  avatar.setScale(facing === 'west' ? -1 : 1, 1)
}

/** Test-only scene diagnostics can verify that drawing layers agree with the facing. */
export function readIllustratedWandererFacing(avatar: Phaser.GameObjects.Container): {
  facing: WandererFacing
  frontVisible: boolean
  rearVisible: boolean
  profileVisible: boolean
} | null {
  const layer = wandererMotion.get(avatar)
  return layer ? {
    facing: layer.facing,
    frontVisible: layer.front.visible,
    rearVisible: layer.rear.visible,
    profileVisible: layer.profile.visible,
  } : null
}

/**
 * Purely decorative walk-cycle of the painted silhouette. The parent avatar
 * is still anchored to the authoritative interpolated world position, which
 * is also used by the camera and name labels.
 *
 * No new game state, tweens, timers, per-frame objects or physics bodies.
 * A non-zero bob is returned only for E2E diagnostics.
 */
export function setIllustratedWandererStride(
  avatar: Phaser.GameObjects.Container,
  remainingDistance: number,
  timeMs: number,
  reducedMotion: boolean,
): number {
  const layer = wandererMotion.get(avatar)
  if (!layer) return 0
  if (reducedMotion || !Number.isFinite(remainingDistance) || remainingDistance <= 0.75) {
    layer.gait.y = 0
    layer.gait.angle = 0
    layer.trail.alpha = 0
    return 0
  }

  const cycle = timeMs / 125
  const bob = Math.abs(Math.sin(cycle)) * 2.5
  layer.gait.y = -bob
  layer.gait.angle = Math.sin(cycle) * 2.25
  layer.trail.alpha = Math.max(0, Math.sin(cycle)) * 0.28
  return bob
}

const peerPalettes: readonly CloakPalette[] = [
  { robe: 0x267e92, shadow: 0x16485d, trim: 0x8ce1da, mantle: 0x254668, hair: 0x172636 },
  { robe: 0x8362ae, shadow: 0x453b6a, trim: 0xd8bdfb, mantle: 0x433257, hair: 0x302640 },
  { robe: 0x487c5a, shadow: 0x244d42, trim: 0xb6e4a6, mantle: 0x314753, hair: 0x2c3442 },
  { robe: 0x9e684c, shadow: 0x664437, trim: 0xffd3a1, mantle: 0x5d3e50, hair: 0x312d3a },
]


function catalogColor(key: string, fallback: number): number {
  const hex = PREVIEW_COLORS[key]
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? Number.parseInt(hex.slice(1), 16) : fallback
}

function shade(color: number, intensity: number): number {
  const scale = (channel: number) => Math.round(channel * intensity)
  return (scale((color >>> 16) & 255) << 16)
    | (scale((color >>> 8) & 255) << 8)
    | scale(color & 255)
}

export function stableArtHash(text: string): number {
  // FNV-1a: stable across reconnects, client order and reloads.
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * A hand-drawn chibi-style wanderer whose feet remain at local (0, 0).
 * Its colors are a decorative local palette, NOT a claim about the player's
 * saved character customization. The same world snapshot drives movement.
 */
export function createIllustratedWanderer(
  scene: Phaser.Scene,
  playerId: string,
  isSelf: boolean,
  appearance: CharacterAppearanceDraft | null = null,
): Phaser.GameObjects.Container {
  const hash = stableArtHash(playerId)
  const legacyPalette = isSelf
    ? { robe: 0xb88b3b, shadow: 0x69543b, trim: 0xffe6a3, mantle: 0x48566d, hair: 0x392d3f }
    : peerPalettes[hash % peerPalettes.length]
  const robe = appearance ? catalogColor(appearance.topColor, legacyPalette.robe) : legacyPalette.robe
  const palette: CloakPalette = appearance
    ? {
        robe,
        shadow: shade(robe, 0.58),
        trim: shade(robe, 1.05),
        mantle: catalogColor(appearance.bottomColor, legacyPalette.mantle),
        hair: catalogColor(appearance.hairColor, legacyPalette.hair),
      }
    : legacyPalette
  const skin = appearance
    ? catalogColor(appearance.skinTone, 0xe5b28e)
    : [0xf0c8a3, 0xbfa184, 0xe5b28e, 0xcdaaa2][(hash >>> 5) % 4]
  const footwear = appearance ? catalogColor(appearance.shoeColor, 0x172437) : 0x172437
  const lower = appearance ? catalogColor(appearance.bottomColor, 0x1d3146) : 0x1d3146
  const torsoWidth = appearance?.bodyType === 'body-1' ? 17 : appearance?.bodyType === 'body-3' ? 23 : 20
  const leftAccessory = (hash & 1) === 0

  const shadow = scene.add.ellipse(0, -1, 29, 10, 0x06131f, 0.67)
  const glow = scene.add.ellipse(0, -20, 36, 46, isSelf ? 0xffd88c : palette.trim, 0.1)
  const painting = scene.add.graphics()

  // Cape, split hem, boots and a small travel pouch give a readable silhouette.
  painting.fillStyle(0x0b1d2e, 0.92)
  painting.fillEllipse(0, -9, 27, 12)
  painting.fillStyle(palette.mantle, 1)
  painting.fillTriangle(-10, -25, -15, -6, 0, -7)
  painting.fillTriangle(10, -25, 15, -6, 0, -7)
  painting.fillStyle(lower, 1)
  if (appearance?.bottomStyle === 'skirt') {
    painting.fillTriangle(-11, -14, -12, -3, 12, -3)
    painting.fillTriangle(-11, -14, 12, -14, 12, -3)
  } else {
    painting.fillRoundedRect(-9, -8, 7, 9, 2)
    painting.fillRoundedRect(2, -8, 7, 9, 2)
  }
  painting.fillStyle(footwear, 1)
  painting.fillRoundedRect(-11, -4, 10, appearance?.shoeStyle === 'shoe-2' ? 7 : 5, 2)
  painting.fillRoundedRect(1, -4, 10, appearance?.shoeStyle === 'shoe-2' ? 7 : 5, 2)
  painting.fillStyle(palette.shadow, 1)
  painting.fillRoundedRect(-torsoWidth / 2 - 1, -27, torsoWidth + 2, 20, 5)
  painting.fillStyle(palette.robe, 1)
  painting.fillRoundedRect(-torsoWidth / 2, -26, torsoWidth, 17, 4)
  painting.fillStyle(palette.trim, 0.85)
  painting.fillRect(-2, -25, 4, 12)
  painting.fillRect(-9, -13, 18, 3)

  // Padded shoulders, hands, neck and belt pouch; all remain decorative.
  painting.fillStyle(palette.mantle, 1)
  painting.fillRoundedRect(-15, -26, 9, 14, 4)
  painting.fillRoundedRect(6, -26, 9, 14, 4)
  painting.fillStyle(skin, 1)
  painting.fillCircle(-12, -13, 4)
  painting.fillCircle(12, -13, 4)
  painting.fillRect(-4, -29, 8, 6)
  painting.fillStyle(0x735443, 1)
  painting.fillRoundedRect(leftAccessory ? -13 : 8, -15, 5, 7, 1)
  painting.fillStyle(palette.trim, 1)
  painting.fillCircle(leftAccessory ? -11 : 10, -12, 1.1)

  // Keep the frontal face in its own view layer. Otherwise its eyes and
  // hairstyle can leak around the narrower profile/rear head silhouettes.
  // Both cosmetics and the shared body stay anchored to the same feet.
  const front = scene.add.graphics()
  // Large face and expressive eyes read better on portrait mobile screens.
  front.fillStyle(0x122334, 1)
  front.fillEllipse(0, -36, 25, 24)
  front.fillStyle(skin, 1)
  front.fillEllipse(0, -35, appearance?.face === 'face-2' ? 24 : appearance?.face === 'face-3' ? 19 : 21, 20)
  front.fillStyle(palette.hair, 1)
  front.fillEllipse(0, -42, 23, 12)
  if (appearance?.hairStyle === 'hair-2' || appearance?.hairStyle === 'hair-3') {
    front.fillRoundedRect(-12, -42, 5, appearance.hairStyle === 'hair-3' ? 20 : 13, 2)
    front.fillRoundedRect(7, -42, 5, appearance.hairStyle === 'hair-3' ? 20 : 13, 2)
  } else if (appearance?.hairStyle === 'hair-4') {
    front.fillTriangle(-12, -44, -4, -33, 3, -42)
    front.fillTriangle(0, -45, 8, -33, 12, -43)
  } else {
    front.fillTriangle(-11, -42, -8, -32, -3, -42)
    front.fillTriangle(5, -43, 9, -32, 11, -42)
  }
  front.fillStyle(0x202a3d, 1)
  front.fillCircle(-5, appearance?.face === 'face-3' ? -36 : -35, 1.4)
  front.fillCircle(5, appearance?.face === 'face-3' ? -36 : -35, 1.4)
  front.lineStyle(1, 0x704b35, 0.9)
  if (appearance?.face === 'face-2') front.lineBetween(-2, -29, 2, -29)
  else front.strokeEllipse(0, -30, 4, appearance?.face === 'face-3' ? 1 : 2)
  // A bright clasp and a subtle rune distinguish the player's avatar.
  front.fillStyle(isSelf ? 0xffec91 : palette.trim, 1)
  front.fillCircle(0, -22, 3)
  front.fillStyle(0xffffff, 0.85)
  front.fillCircle(-1, -23, 0.8)

  // The frontal face, profile and rear are mutually exclusive. Each view is
  // built once per avatar; server-owned turns only toggle Graphics visibility.
  // No per-frame redraw, additional input surface or new world coordinates.
  const profile = scene.add.graphics()
  profile.fillStyle(palette.mantle, 1)
  profile.fillRoundedRect(-10, -27, 18, 16, 4)
  profile.fillStyle(skin, 1)
  profile.fillEllipse(0, -35, 21, 21)
  profile.fillTriangle(8, -37, 14, -34, 8, -31)
  profile.fillStyle(palette.hair, 1)
  profile.fillEllipse(-2, -42, 21, 13)
  profile.fillRoundedRect(-12, -41, 7, appearance?.hairStyle === 'hair-3' ? 18 : 11, 3)
  profile.fillStyle(0x202a3d, 1)
  profile.fillCircle(5, -35, 1.65)
  profile.fillStyle(palette.trim, 1)
  profile.fillCircle(0, -22, 2)
  profile.visible = false

  const rear = scene.add.graphics()
  rear.fillStyle(palette.mantle, 1)
  rear.fillRoundedRect(-torsoWidth / 2 - 2, -29, torsoWidth + 4, 22, 5)
  rear.fillStyle(palette.shadow, 0.95)
  rear.fillTriangle(-9, -12, -12, -5, 0, -7)
  rear.fillTriangle(9, -12, 12, -5, 0, -7)
  rear.lineStyle(2, palette.trim, 0.7)
  rear.lineBetween(0, -24, 0, -10)
  rear.fillStyle(palette.hair, 1)
  rear.fillEllipse(0, -36, 24, 23)
  rear.fillRoundedRect(-12, -45, 24, appearance?.hairStyle === 'hair-3' ? 21 : 16, 5)
  rear.fillStyle(palette.mantle, 1)
  rear.fillEllipse(0, -29, 25, 8)
  rear.visible = false

  // Only the illustrated silhouette moves vertically, never its root/feet.
  // A single low-opacity ground flash is drawn once and reused every frame.
  const trail = scene.add.ellipse(0, -1, 30, 8, palette.trim, 0.38)
  trail.alpha = 0
  const gait = scene.add.container(0, 0, [painting, front, profile, rear])
  const body = scene.add.container(0, 0, [glow, shadow, trail, gait])
  wandererMotion.set(body, { gait, trail, front, profile, rear, facing: 'south' })
  body.setDepth(10)
  body.setSize(34, 50)
  return body
}

function cellNoise(x: number, y: number): number {
  const a = Math.imul(x ^ 0x45d9f3b, 0x27d4eb2d)
  const b = Math.imul(y ^ 0x119de1f3, 0x165667b1)
  const hash = a ^ b
  return (hash ^ (hash >>> 16)) >>> 0
}


// A macro-tile woodland backdrop. Fixed cell coordinates are the only seed:
// all browsers see the same scenery even with different zoom or join order.
// Everything is drawn on terrain Graphics (depth -10), behind players/portals.
export type WoodlandLandmark = {
  key: string
  kind: 'fallen-log' | 'fern-thicket' | 'moss-glade'
  x: number
  y: number
}

const GROVE_WIDTH = 9
const GROVE_HEIGHT = 8
const GROVE_MARGIN = 4 // tiles: scenery extends beyond the anchor tile

export function woodlandLandmarksInBounds(
  left: number,
  top: number,
  right: number,
  bottom: number,
): WoodlandLandmark[] {
  const landmarks: WoodlandLandmark[] = []
  for (let cellX = Math.floor((left - GROVE_MARGIN) / GROVE_WIDTH);
    cellX <= Math.floor((right + GROVE_MARGIN) / GROVE_WIDTH); cellX++) {
    for (let cellY = Math.floor((top - GROVE_MARGIN) / GROVE_HEIGHT);
      cellY <= Math.floor((bottom + GROVE_MARGIN) / GROVE_HEIGHT); cellY++) {
      const seed = cellNoise(cellX, cellY)
      const kind: WoodlandLandmark['kind'] =
        seed % 3 === 0 ? 'fallen-log' : seed % 3 === 1 ? 'fern-thicket' : 'moss-glade'
      landmarks.push({
        key: `${cellX}:${cellY}`,
        kind,
        x: (cellX * GROVE_WIDTH + 3 + (seed % 3)) * TILE,
        y: (cellY * GROVE_HEIGHT + 2 + ((seed >>> 3) % 3)) * TILE,
      })
    }
  }
  return landmarks
}

/**
 * Paint after all tile rectangles so large objects are not cut by adjacent
 * fillRect calls. There are no GameObjects, input surfaces, physics, tweens
 * or per-frame allocations: WorldScene redraws only on tile-bound changes.
 */
export function paintWoodlandLandmarks(
  graphics: Phaser.GameObjects.Graphics,
  left: number,
  top: number,
  right: number,
  bottom: number,
): WoodlandLandmark[] {
  const landmarks = woodlandLandmarksInBounds(left, top, right, bottom)
  for (const landmark of landmarks) {
    const { x, y } = landmark
    if (landmark.kind === 'fallen-log') {
      // A weathered trunk, broken bark, moss and tiny fungi.
      graphics.fillStyle(0x071f28, 0.52)
      graphics.fillEllipse(x, y + 20, 120, 34)
      graphics.fillStyle(0x385346, 0.92)
      graphics.fillRoundedRect(x - 49, y - 12, 102, 28, 10)
      graphics.fillStyle(0x715d4c, 1)
      graphics.fillRoundedRect(x - 46, y - 16, 96, 24, 9)
      graphics.lineStyle(2, 0xa18a69, 0.8)
      graphics.lineBetween(x - 33, y - 9, x + 31, y - 9)
      graphics.lineBetween(x - 18, y + 1, x + 25, y + 1)
      graphics.fillStyle(0x9d8a68, 1)
      graphics.fillEllipse(x + 46, y - 3, 15, 23)
      graphics.lineStyle(2, 0x4f392f, 0.85)
      graphics.strokeEllipse(x + 46, y - 3, 9, 15)
      graphics.fillStyle(0x5b9c76, 0.9)
      graphics.fillEllipse(x - 22, y - 17, 35, 9)
      graphics.fillEllipse(x + 12, y - 17, 24, 8)
      graphics.fillStyle(0xf1d5a3, 0.9)
      graphics.fillCircle(x - 37, y + 13, 3)
      graphics.fillCircle(x - 31, y + 16, 2)
    } else if (landmark.kind === 'fern-thicket') {
      // Three overlapping fronds share a deep forest shadow.
      graphics.fillStyle(0x08282f, 0.58)
      graphics.fillEllipse(x, y + 16, 125, 43)
      for (const offset of [-35, 0, 35]) {
        const tipY = y - (offset === 0 ? 41 : 28)
        const rootX = x + offset
        graphics.lineStyle(3, 0x376f5c, 0.95)
        graphics.lineBetween(rootX, y + 15, rootX + 7, tipY)
        graphics.fillStyle(offset === 0 ? 0x579876 : 0x47806a, 0.96)
        graphics.fillEllipse(rootX - 9, y - 7, 28, 10)
        graphics.fillEllipse(rootX + 13, y - 19, 31, 10)
        graphics.fillEllipse(rootX - 5, tipY + 7, 22, 9)
      }
      graphics.fillStyle(0xaad7a5, 0.85)
      graphics.fillCircle(x - 41, y + 2, 2.5)
      graphics.fillCircle(x + 42, y - 6, 2)
    } else {
      // Wide soft clearing, leafy islands and bright petals, not a portal.
      graphics.fillStyle(0x132f35, 0.68)
      graphics.fillEllipse(x, y, 146, 78)
      graphics.fillStyle(0x315e51, 0.88)
      graphics.fillEllipse(x, y - 2, 133, 65)
      graphics.fillStyle(0x447663, 0.62)
      graphics.fillEllipse(x - 18, y - 10, 82, 39)
      graphics.fillStyle(0x68a181, 0.72)
      graphics.fillEllipse(x + 30, y + 13, 42, 18)
      for (const [dx, dy] of [[-38, -5], [-4, 14], [29, -15], [49, 7]]) {
        graphics.fillStyle(0xe7c7a1, 0.88)
        graphics.fillCircle(x + dx, y + dy, 2)
        graphics.fillStyle(0x8bbfa2, 0.9)
        graphics.fillCircle(x + dx + 3, y + dy + 2, 1.5)
      }
    }
  }
  return landmarks
}

/**
 * Paint a visible-only woodland floor with coherent 5x5-tile color regions,
 * moss, scattered stones, rune markers and fireflies. Everything is passable.
 * No sprites, collision bodies or per-frame allocations are introduced.
 */
export function paintWoodlandTile(
  graphics: Phaser.GameObjects.Graphics,
  tileX: number,
  tileY: number,
): void {
  const x = tileX * TILE
  const y = tileY * TILE
  const noise = cellNoise(tileX, tileY)
  const region = cellNoise(Math.floor(tileX / 5), Math.floor(tileY / 5))
  const ground = [0x193b43, 0x163740, 0x1c3e45, 0x193a48, 0x1c3a3d][region % 5]
  graphics.fillStyle(ground, 1)
  graphics.fillRect(x, y, TILE, TILE)

  // Soft dappled patches soften the former harsh chessboard grid.
  if (noise % 4 === 0) {
    graphics.fillStyle(0x335b4c, 0.36)
    graphics.fillEllipse(x + 14, y + 17, 25, 15)
  }
  if (noise % 6 === 0) {
    graphics.fillStyle(0x132e3a, 0.64)
    graphics.fillEllipse(x + 25, y + 7, 19, 12)
  }
  // Broken stone and lichen, including a tiny highlight on the upper edge.
  if (noise % 37 === 0) {
    graphics.fillStyle(0x0c2934, 0.72)
    graphics.fillEllipse(x + 16, y + 25, 22, 8)
    graphics.fillStyle(0x486975, 1)
    graphics.fillRoundedRect(x + 8, y + 10, 17, 15, 3)
    graphics.fillStyle(0x6b9197, 0.68)
    graphics.fillRect(x + 10, y + 12, 12, 2)
    graphics.fillStyle(0x517c69, 0.8)
    graphics.fillRect(x + 20, y + 19, 3, 3)
  } else if (noise % 13 === 0) {
    // Ferns: different heights produce depth without occupying game space.
    graphics.lineStyle(2, 0x417e66, 0.85)
    graphics.lineBetween(x + 16, y + 27, x + 16, y + 11)
    graphics.lineBetween(x + 16, y + 19, x + 9, y + 13)
    graphics.lineBetween(x + 16, y + 17, x + 23, y + 12)
    graphics.fillStyle(0x6aa387, 0.8)
    graphics.fillEllipse(x + 10, y + 13, 10, 5)
    graphics.fillEllipse(x + 22, y + 12, 10, 5)
  } else if (noise % 61 === 0) {
    // Tiny original obelisk with an unpowered rune: scenic, not a portal.
    graphics.fillStyle(0x061c2a, 0.7)
    graphics.fillEllipse(x + 16, y + 29, 22, 7)
    graphics.fillStyle(0x426779, 1)
    graphics.fillTriangle(x + 10, y + 12, x + 16, y + 5, x + 22, y + 12)
    graphics.fillRoundedRect(x + 10, y + 11, 12, 17, 2)
    graphics.fillStyle(0x80b9b9, 0.9)
    graphics.fillRect(x + 15, y + 15, 2, 8)
    graphics.fillRect(x + 12, y + 18, 8, 2)
  }

  // Small points of light are sparse and inexpensive even on ultrawide.
  if (noise % 19 === 0) {
    graphics.fillStyle(0x90e6bf, 0.14)
    graphics.fillCircle(x + 23, y + 9, 5)
    graphics.fillStyle(0xa5f7d0, 0.9)
    graphics.fillCircle(x + 23, y + 9, 1.4)
  }
}
