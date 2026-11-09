import { expect, test } from '@playwright/test'
import { computeWorldCameraZoom, WORLD_MAX_CAMERA_ZOOM } from '../src/game/WorldCamera'

test('responsive world camera increases avatar scale without sacrificing phone context', () => {
  expect(computeWorldCameraZoom(320, 568)).toBe(1)
  expect(computeWorldCameraZoom(390, 844)).toBe(1)
  expect(computeWorldCameraZoom(768, 1024)).toBe(1.15)
  expect(computeWorldCameraZoom(1280, 720)).toBe(1.15)
  expect(computeWorldCameraZoom(1920, 1080)).toBe(1.65)
  expect(computeWorldCameraZoom(3440, 1440)).toBe(WORLD_MAX_CAMERA_ZOOM)

  for (const [width, height] of [
    [601, 400], [900, 600], [1024, 360], [1280, 480], [1920, 540], [6000, 2200],
  ]) {
    const zoom = computeWorldCameraZoom(width, height)
    expect(zoom).toBeGreaterThanOrEqual(1)
    expect(zoom).toBeLessThanOrEqual(WORLD_MAX_CAMERA_ZOOM)
    expect(width / (32 * zoom)).toBeGreaterThanOrEqual(Math.min(14, width / 32))
    expect(height / (32 * zoom)).toBeGreaterThanOrEqual(Math.min(12, height / 32))
  }
})

test('world zoom is a deterministic resize policy with a safe invalid-size fallback', () => {
  expect(computeWorldCameraZoom(0, 720)).toBe(1)
  expect(computeWorldCameraZoom(1280, -1)).toBe(1)
  expect(computeWorldCameraZoom(Number.NaN, 720)).toBe(1)
  expect(computeWorldCameraZoom(1920, Infinity)).toBe(1)
  expect(computeWorldCameraZoom(1920, 1080)).toBe(computeWorldCameraZoom(1920, 1080))
  expect(computeWorldCameraZoom(390, 844)).toBe(1)
})
