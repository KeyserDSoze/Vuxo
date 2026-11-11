import { expect, test } from '@playwright/test'
import { nextWorldTerrainWindow, WORLD_TERRAIN_BUFFER_TILES,
  WORLD_TERRAIN_GUARD_TILES, type WorldTerrainView, type WorldTerrainWindow,
} from '../src/game/WorldTerrainWindow'

const view = (left: number, top: number, width: number, height: number): WorldTerrainView =>
  ({ left, top, right: left + width, bottom: top + height })
const covers = (b: WorldTerrainWindow, v: WorldTerrainView) =>
  b.left * 32 <= v.left && b.top * 32 <= v.top
  && (b.right + 1) * 32 >= v.right && (b.bottom + 1) * 32 >= v.bottom

test('hysteresis reuses Graphics through repeated tile crossings', () => {
  const initial = view(-210, 80, 390, 844)
  const first = nextWorldTerrainWindow(initial, null)!
  expect(WORLD_TERRAIN_BUFFER_TILES).toBeGreaterThan(WORLD_TERRAIN_GUARD_TILES)
  for (let pixels = 0; pixels <= 4 * 32; pixels += 8) {
    const pan = view(initial.left + pixels, initial.top - pixels, 390, 844)
    expect(nextWorldTerrainWindow(pan, first)).toBeNull()
    expect(covers(first, pan)).toBe(true)
  }
  const far = view(initial.left + 6 * 32, initial.top, 390, 844)
  const recentered = nextWorldTerrainWindow(far, first)!
  expect(recentered).not.toBeNull()
  expect(covers(recentered, far)).toBe(true)
  expect(nextWorldTerrainWindow(far, recentered)).toBeNull()
})

test('negative, zoomed, mobile and ultrawide views all stay covered', () => {
  for (const width of [320, 390, 768, 1280, 1920, 3440]) {
    for (const zoom of [1, 1.15, 1.65, 1.9]) {
      const visible = view(-1234.25, -987.75, width / zoom, 1440 / zoom)
      const first = nextWorldTerrainWindow(visible, null)!
      expect(covers(first, visible)).toBe(true)
      expect(nextWorldTerrainWindow(visible, first)).toBeNull()
      const resized = view(-1234.25, -987.75, 3440 / zoom, 1440 / zoom)
      expect(covers(nextWorldTerrainWindow(resized, null)!, resized)).toBe(true)
    }
  }
})

test('bidirectional pans redraw near bounds, not on each tile', () => {
  let cache: WorldTerrainWindow | null = null
  let redraws = 0
  for (let step = 0; step < 150; step++) {
    const visible = view(-1200 + step * 17,
      step < 75 ? -960 - step * 10 : -1710 + (step - 75) * 11,
      1920 / 1.65, 1080 / 1.65)
    const next = nextWorldTerrainWindow(visible, cache)
    if (next) { cache = next; redraws++ }
    expect(covers(cache!, visible)).toBe(true)
  }
  expect(redraws).toBeGreaterThan(1)
  expect(redraws).toBeLessThan(65)
  expect(nextWorldTerrainWindow({ left: NaN, top: 0, right: 50, bottom: 20 }, cache)).toBeNull()
})
