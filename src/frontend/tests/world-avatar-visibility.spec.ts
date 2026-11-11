import { expect, test } from '@playwright/test'
import { isWorldAvatarInView, WORLD_AVATAR_OVERSCAN } from '../src/game/WorldAvatarVisibility'

const view = { left: 300, top: 400, right: 700, bottom: 800 }

test('visible peers and overscan boundaries remain stable while out-of-view crowds are excluded', () => {
  expect(WORLD_AVATAR_OVERSCAN).toBe(128)
  for (const [x, y] of [[300, 400], [500, 600], [700, 800], [172, 400], [828, 800],
    [300, 272], [700, 928]]) {
    expect(isWorldAvatarInView(view, x, y)).toBe(true)
  }
  for (const [x, y] of [[171.99, 400], [828.01, 800], [300, 271.9],
    [700, 928.1], [-3000, 400], [10000, 10000]]) {
    expect(isWorldAvatarInView(view, x, y)).toBe(false)
  }
})

test('zoom or viewport resize changes rendering region, never player positions', () => {
  const self = { x: 500, y: 600 }
  const peer = { x: 1300, y: 900 }
  const phoneView = { left: 340, top: 400, right: 660, bottom: 968 }
  const wideView = { left: 100, top: 300, right: 1500, bottom: 1100 }
  expect(isWorldAvatarInView(phoneView, self.x, self.y)).toBe(true)
  expect(isWorldAvatarInView(phoneView, peer.x, peer.y)).toBe(false)
  expect(isWorldAvatarInView(wideView, peer.x, peer.y)).toBe(true)
  expect(self).toEqual({ x: 500, y: 600 })
  expect(peer).toEqual({ x: 1300, y: 900 })
})

test('invalid camera or player positions do not produce unreliable offscreen art', () => {
  expect(isWorldAvatarInView(view, NaN, 500)).toBe(false)
  expect(isWorldAvatarInView(view, 500, Infinity)).toBe(false)
  expect(isWorldAvatarInView({ ...view, left: Infinity }, 500, 500)).toBe(false)
  expect(isWorldAvatarInView({ ...view, left: 900 }, 500, 500)).toBe(false)
  expect(isWorldAvatarInView(view, 500, 500, -1)).toBe(false)
  expect(isWorldAvatarInView(view, 500, 500, NaN)).toBe(false)
  expect(isWorldAvatarInView(view, 500, 500, 0)).toBe(true)
})
