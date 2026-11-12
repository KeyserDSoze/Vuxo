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

test('camera zoom blends across phone/tablet and tablet/desktop thresholds without a one-pixel jump', () => {
  for (const height of [568, 720, 800, 1024, 1440]) {
    const phoneBefore = computeWorldCameraZoom(599, height)
    const phoneAfter = computeWorldCameraZoom(600, height)
    const desktopBefore = computeWorldCameraZoom(1023, height)
    const desktopAfter = computeWorldCameraZoom(1024, height)
    expect(Math.abs(phoneAfter - phoneBefore)).toBeLessThanOrEqual(0.050001)
    expect(Math.abs(desktopAfter - desktopBefore)).toBeLessThanOrEqual(0.050001)

    // At fixed height, more horizontal space cannot force a smaller zoom.
    let previous = 1
    for (const width of [320, 390, 560, 599, 600, 640, 700, 760, 768,
      896, 960, 1023, 1024, 1080, 1152, 1280, 1920, 3440]) {
      const zoom = computeWorldCameraZoom(width, height)
      expect(Number.isFinite(zoom)).toBe(true)
      expect(zoom).toBeGreaterThanOrEqual(previous - 0.000001)
      expect(zoom).toBeGreaterThanOrEqual(1)
      expect(zoom).toBeLessThanOrEqual(WORLD_MAX_CAMERA_ZOOM)
      expect(width / (32 * zoom)).toBeGreaterThanOrEqual(
        Math.min(14, width / 32) - 0.000001)
      expect(height / (32 * zoom)).toBeGreaterThanOrEqual(
        Math.min(12, height / 32) - 0.000001)
      previous = zoom
    }
  }
  // The old policy jumped 1.0 -> 1.2 over this single pixel on 800px-high
  // windows. Adjacent widths now share a safe deterministic camera step.
  expect(computeWorldCameraZoom(1023, 800))
    .toBe(computeWorldCameraZoom(1024, 800))
})
