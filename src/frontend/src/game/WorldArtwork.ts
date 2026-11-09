import Phaser from 'phaser'

// VUXO's first original procedural world art. These graphics are presentation
// only: no asset licence, gameplay collision, character appearance claim,
// coordinates, economy or server-owned data are introduced.
export const WORLD_ART_VERSION = 'vuxo-world-art-v1'
const TILE = 32

type CloakPalette = {
  robe: number
  shadow: number
  trim: number
  mantle: number
  hair: number
}

const peerPalettes: readonly CloakPalette[] = [
  { robe: 0x267e92, shadow: 0x16485d, trim: 0x8ce1da, mantle: 0x254668, hair: 0x172636 },
  { robe: 0x8362ae, shadow: 0x453b6a, trim: 0xd8bdfb, mantle: 0x433257, hair: 0x302640 },
  { robe: 0x487c5a, shadow: 0x244d42, trim: 0xb6e4a6, mantle: 0x314753, hair: 0x2c3442 },
  { robe: 0x9e684c, shadow: 0x664437, trim: 0xffd3a1, mantle: 0x5d3e50, hair: 0x312d3a },
]

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
): Phaser.GameObjects.Container {
  const hash = stableArtHash(playerId)
  const palette = isSelf
    ? { robe: 0xb88b3b, shadow: 0x69543b, trim: 0xffe6a3, mantle: 0x48566d, hair: 0x392d3f }
    : peerPalettes[hash % peerPalettes.length]
  const skin = [0xf0c8a3, 0xbfa184, 0xe5b28e, 0xcdaaa2][(hash >>> 5) % 4]
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
  painting.fillStyle(0x1d3146, 1)
  painting.fillRoundedRect(-9, -8, 7, 9, 2)
  painting.fillRoundedRect(2, -8, 7, 9, 2)
  painting.fillStyle(0x172437, 1)
  painting.fillRoundedRect(-11, -4, 10, 5, 2)
  painting.fillRoundedRect(1, -4, 10, 5, 2)
  painting.fillStyle(palette.shadow, 1)
  painting.fillRoundedRect(-11, -27, 22, 20, 5)
  painting.fillStyle(palette.robe, 1)
  painting.fillRoundedRect(-9, -26, 18, 17, 4)
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

  // Large face and expressive eyes read better on portrait mobile screens.
  painting.fillStyle(0x122334, 1)
  painting.fillEllipse(0, -36, 25, 24)
  painting.fillStyle(skin, 1)
  painting.fillEllipse(0, -35, 21, 20)
  painting.fillStyle(palette.hair, 1)
  painting.fillEllipse(0, -42, 23, 12)
  painting.fillTriangle(-11, -42, -8, -32, -3, -42)
  painting.fillTriangle(5, -43, 9, -32, 11, -42)
  painting.fillStyle(0x202a3d, 1)
  painting.fillCircle(-5, -35, 1.4)
  painting.fillCircle(5, -35, 1.4)
  painting.fillStyle(0xd48e79, 0.8)
  painting.fillRect(-2, -29, 4, 1)
  // A bright clasp and a subtle rune distinguish the player's avatar.
  painting.fillStyle(isSelf ? 0xffec91 : palette.trim, 1)
  painting.fillCircle(0, -22, 3)
  painting.fillStyle(0xffffff, 0.85)
  painting.fillCircle(-1, -23, 0.8)

  const body = scene.add.container(0, 0, [glow, shadow, painting])
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
