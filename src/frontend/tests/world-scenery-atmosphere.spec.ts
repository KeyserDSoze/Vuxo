import { expect, test, type Page } from '@playwright/test'
import { AMBIENT_CYCLE_MS, ambientLight, ambientPhase, lerpColor } from '../src/game/WorldAmbience'
import { creaturePose, creaturesInBounds } from '../src/game/WorldCreatures'
import { allSceneryFrames, GROUND_FRAMES, SCENERY_FRAMES, sceneryInBounds } from '../src/game/WorldScenery'

const origin = 'http://127.0.0.1:4173'
const gameUrl = origin + '/Vuxo/#/game'

// Pure, deterministic rules: the same tiles/time always give the same cosmetics.
test('scenery is a deterministic, sparse function of tile coordinates', () => {
  const a = sceneryInBounds(-40, -30, 40, 30)
  const b = sceneryInBounds(-40, -30, 40, 30)
  expect(a).toEqual(b)
  expect(a.length).toBeGreaterThan(40)
  // Roughly one prop per ten tiles: bounded cost even on large windows.
  expect(a.length).toBeLessThan(81 * 61 * 0.2)
  expect(new Set(a.map(item => item.key)).size).toBe(a.length)

  // A sub-window sees exactly the props the larger window placed there.
  const inner = sceneryInBounds(-10, -10, 10, 10)
  const innerKeys = new Set(inner.map(item => item.key))
  expect(a.filter(item => innerKeys.has(item.key))).toEqual(inner)
})

test('scenery only uses preloaded frames and sane scales', () => {
  const frames = new Set(allSceneryFrames())
  for (const frame of GROUND_FRAMES) expect(frames.has(frame)).toBe(true)
  for (const item of sceneryInBounds(-60, -60, 60, 60)) {
    expect(frames.has(item.frame)).toBe(true)
    expect(SCENERY_FRAMES[item.kind]).toContain(item.frame)
    expect(item.scale).toBeGreaterThan(0.4)
    expect(item.scale).toBeLessThan(2)
    expect(Number.isFinite(item.x) && Number.isFinite(item.y)).toBe(true)
  }
})

test('ambient light cycles smoothly and wraps without jumps', () => {
  expect(ambientPhase(0)).toBe(0)
  expect(ambientPhase(AMBIENT_CYCLE_MS / 2)).toBeCloseTo(0.5)
  expect(ambientPhase(-AMBIENT_CYCLE_MS / 4)).toBeCloseTo(0.75)
  expect(ambientPhase(Number.NaN)).toBe(0)
  const names = new Set<string>()
  let previous = ambientLight(0).color
  for (let step = 1; step <= 400; step++) {
    const light = ambientLight(step / 400)
    names.add(light.name)
    const channelStep = (shift: number) => Math.abs(((light.color >>> shift) & 255) - ((previous >>> shift) & 255))
    expect(Math.max(channelStep(16), channelStep(8), channelStep(0))).toBeLessThan(12)
    previous = light.color
  }
  expect(names).toEqual(new Set(['moonlit', 'deep-night', 'dawn', 'twilight']))
  expect(ambientLight(1).color).toBe(ambientLight(0).color)
  expect(ambientLight(Number.NaN).name).toBe('moonlit')
  expect(lerpColor(0x000000, 0xffffff, 2)).toBe(0xffffff)
  expect(lerpColor(0x000000, 0xffffff, -1)).toBe(0x000000)
})

test('creatures are reproducible, stay near home and rest under reduced motion', () => {
  const creatures = creaturesInBounds(-80, -60, 80, 60)
  expect(creatures).toEqual(creaturesInBounds(-80, -60, 80, 60))
  expect(creatures.length).toBeGreaterThan(10)
  expect(new Set(creatures.map(creature => creature.kind))).toEqual(new Set(['moth', 'rabbit']))
  for (const creature of creatures.slice(0, 60)) {
    const still = creaturePose(creature, 123_456, true)
    expect(still).toEqual(creaturePose(creature, 987_654, true))
    expect(still.moving).toBe(false)
    for (const time of [0, 1_000, 6_499, 6_500, 13_333, 91_000]) {
      const pose = creaturePose(creature, time, false)
      expect(pose).toEqual(creaturePose(creature, time, false))
      expect(Math.hypot(pose.x - creature.homeX, pose.y - creature.homeY)).toBeLessThanOrEqual(creature.radius * 1.1)
    }
  }
})

async function openWorld(page: Page, scope: string, options: { phase?: number } = {}) {
  await page.addInitScript(({ scope, phase }) => {
    localStorage.setItem('vuxo.e2ePlayerId', 'art-' + scope)
    localStorage.setItem('vuxo.e2eWorldScope', scope)
    localStorage.setItem('vuxo.e2eCharacterName', 'Art Wanderer')
    localStorage.setItem('vuxo.language', 'it')
    localStorage.setItem('vuxo.theme', 'dark')
    if (phase !== undefined) localStorage.setItem('vuxo.e2eAmbientPhase', String(phase))
  }, { scope, phase: options.phase })
  await page.request.post(origin + '/__vuxo_e2e/world/reset?scope=' + scope)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(gameUrl)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
}

type SceneryEvidence = { count: number; sample: Array<{ key: string; kind: string; x: number; y: number }> }
type AtmosphereEvidence = { ambient: string; reducedMotion: boolean; creatures: number; glows: number; fireflies: boolean }

test('the world draws third-party scenery as decoration without touching players or portals', async ({ page }) => {
  await openWorld(page, 'world-scenery')
  const canvas = page.getByTestId('game-canvas')
  await expect.poll(async () => {
    const raw = await canvas.getAttribute('data-e2e-scenery')
    return raw ? (JSON.parse(raw) as SceneryEvidence).count : 0
  }).toBeGreaterThan(10)
  const evidence = JSON.parse((await canvas.getAttribute('data-e2e-scenery'))!) as SceneryEvidence
  const kinds = new Set(evidence.sample.map(item => item.kind))
  expect(kinds.size).toBeGreaterThan(1)
  // Props are not players: the presence list still contains only the local one.
  await expect(page.locator('[data-player-id]')).toHaveCount(1)
})

test('the ambient light follows the forced day phase and animated effects are on', async ({ page }) => {
  await openWorld(page, 'world-atmosphere-dawn', { phase: 0.5 })
  const canvas = page.getByTestId('game-canvas')
  await expect.poll(async () => {
    const raw = await canvas.getAttribute('data-e2e-atmosphere')
    return raw ? (JSON.parse(raw) as AtmosphereEvidence).ambient : null
  }).toBe('dawn')
  const evidence = JSON.parse((await canvas.getAttribute('data-e2e-atmosphere'))!) as AtmosphereEvidence
  expect(evidence.reducedMotion).toBe(false)
  expect(evidence.fireflies).toBe(true)
  expect(evidence.creatures).toBeGreaterThan(0)
})

test('reduced motion freezes the atmosphere at its moonlit keyframe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWorld(page, 'world-atmosphere-reduced', { phase: 0.5 })
  const canvas = page.getByTestId('game-canvas')
  await expect.poll(async () => {
    const raw = await canvas.getAttribute('data-e2e-atmosphere')
    return raw ? (JSON.parse(raw) as AtmosphereEvidence) : null
  }).toMatchObject({ ambient: 'moonlit', reducedMotion: true, fireflies: false })
})
