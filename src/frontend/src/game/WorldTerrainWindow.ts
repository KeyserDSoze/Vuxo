import { WORLD_TILE_PIXELS } from './WorldCamera'

// The woodland has four-tile scenic overhangs; eight tiles of buffer keep
// an inner guard while permitting several server-owned movement steps.
export const WORLD_TERRAIN_BUFFER_TILES = 8
export const WORLD_TERRAIN_GUARD_TILES = 3

export type WorldTerrainView = {
  left: number; top: number; right: number; bottom: number
}
export type WorldTerrainWindow = {
  left: number; top: number; right: number; bottom: number
}
function tile(value: number, round: (v: number) => number): number {
  const result = round(value / WORLD_TILE_PIXELS)
  return result === 0 ? 0 : result
}

/** Null means reuse the Graphics; the caller invalidates on zoom/resize. */
export function nextWorldTerrainWindow(
  view: WorldTerrainView, previous: WorldTerrainWindow | null,
): WorldTerrainWindow | null {
  if (![view.left, view.top, view.right, view.bottom].every(Number.isFinite)
    || view.right < view.left || view.bottom < view.top) return null

  const left = tile(view.left, Math.floor)
  const top = tile(view.top, Math.floor)
  const right = tile(view.right, Math.ceil)
  const bottom = tile(view.bottom, Math.ceil)
  if (previous
    && left >= previous.left + WORLD_TERRAIN_GUARD_TILES
    && top >= previous.top + WORLD_TERRAIN_GUARD_TILES
    && right <= previous.right - WORLD_TERRAIN_GUARD_TILES
    && bottom <= previous.bottom - WORLD_TERRAIN_GUARD_TILES) return null

  return {
    left: left - WORLD_TERRAIN_BUFFER_TILES, top: top - WORLD_TERRAIN_BUFFER_TILES,
    right: right + WORLD_TERRAIN_BUFFER_TILES, bottom: bottom + WORLD_TERRAIN_BUFFER_TILES,
  }
}
