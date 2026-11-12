import { expect, test, type Page } from '@playwright/test'
import { computeWorldCameraZoom } from '../src/game/WorldCamera'

const origin = 'http://127.0.0.1:4173'
const gameUrl = origin + '/Vuxo/#/game'

// Real browser + deterministic local two-peer world. No client-written
// positions, server appearance, rewards or production credentials.
// Unlike the legacy test world, these scenarios never reset the shared
// default room used by other parallel Playwright workers.
const duoScope = 'world-art-duo'
const resizeScope = 'world-art-resize'
const strideScope = 'world-art-stride'
const facingScope = 'world-art-facing'
const landmarkScope = 'world-art-landmarks'

async function resetRoom(request: import('@playwright/test').APIRequestContext, scope: string) {
  const result = await request.post(origin + '/__vuxo_e2e/world/reset?scope=' + scope)
  expect(result.ok()).toBeTruthy()
}

async function demoPlayer(page: Page, id: string, name: string, scope: string) {
  await page.addInitScript(({ id, name, scope }) => {
    localStorage.setItem('vuxo.e2ePlayerId', id)
    localStorage.setItem('vuxo.e2eWorldScope', scope)
    localStorage.setItem('vuxo.e2eCharacterName', name)
    localStorage.setItem('vuxo.language', 'it')
    localStorage.setItem('vuxo.theme', 'dark')
  }, { id, name, scope })
}

test('two illustrated wanderers coexist in the authoritative world at mobile size', async ({ browser, request }, info) => {
  await resetRoom(request, duoScope)
  // Preview server holds the cosmetic fixture; browsers send only playerId/name.
  const looks = [
  {
    "playerId": "art-player-a",
    "characterName": "Grove Wanderer",
    "appearance": {
      "catalogVersion": "0.0.1",
      "hairStyle": "hair-4",
      "hairColor": "red",
      "face": "face-3",
      "bodyType": "body-1",
      "skinTone": "skin-3",
      "topColor": "green",
      "bottomStyle": "skirt",
      "bottomColor": "white",
      "shoeStyle": "shoe-2",
      "shoeColor": "blue"
    }
  },
  {
    "playerId": "art-player-b",
    "characterName": "Moon Wanderer",
    "appearance": {
      "catalogVersion": "0.0.1",
      "hairStyle": "hair-2",
      "hairColor": "blonde",
      "face": "face-2",
      "bodyType": "body-3",
      "skinTone": "skin-5",
      "topColor": "red",
      "bottomStyle": "shorts",
      "bottomColor": "black",
      "shoeStyle": "shoe-1",
      "shoeColor": "white"
    }
  }
]
  for (const fixture of looks) {
    const seeded = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + duoScope, { data: fixture })
    expect(seeded.ok()).toBeTruthy()
  }
  const a = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const b = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  try {
    const pageA = await a.newPage()
    const pageB = await b.newPage()
    await demoPlayer(pageA, 'art-player-a', 'Grove Wanderer', duoScope)
    await demoPlayer(pageB, 'art-player-b', 'Moon Wanderer', duoScope)
    await pageA.goto(gameUrl)
    await expect(pageA.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
    await pageB.goto(gameUrl)
    await expect(pageB.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')

    // The same two authoritative players are visible in both clients, but
    // each viewer gets exactly one self marker (not an inferred player).
    const selfA = pageA.getByTestId('world-presence-self')
    const selfB = pageB.getByTestId('world-presence-self')
    await expect(selfA).toHaveCount(1)
    await expect(selfB).toHaveCount(1)
    await expect(selfA).toHaveAttribute('data-player-id', 'art-player-a')
    await expect(selfB).toHaveAttribute('data-player-id', 'art-player-b')
    await expect(pageA.locator('[data-player-id="art-player-b"]')).toHaveAttribute('data-self', 'false')
    await expect(pageB.locator('[data-player-id="art-player-a"]')).toHaveAttribute('data-self', 'false')

    for (const page of [pageA, pageB]) {
      await expect(page.locator('[data-player-id="art-player-a"]')).toBeVisible()
      await expect(page.locator('[data-player-id="art-player-b"]')).toBeVisible()
      await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
      await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-e2e-illustrated-player-count', '2')
      await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-e2e-visible-avatar-count', '2')
      await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-e2e-visible-avatar-ids',
        JSON.stringify(['art-player-a', 'art-player-b']))
      await expect.poll(() => page.evaluate(() => {
        const encoded = document.querySelector('[data-testid="game-canvas"]')
          ?.getAttribute('data-e2e-avatar-appearance')
        if (!encoded) return false
        const avatars = JSON.parse(encoded) as Array<{ playerId: string; appearance: string }>
        if (avatars.length !== 2) return false
        const a = avatars.find(p => p.playerId === 'art-player-a')
        const b = avatars.find(p => p.playerId === 'art-player-b')
        return Boolean(a?.appearance.includes('"hairColor":"red"')
          && a?.appearance.includes('"topColor":"green"')
          && a?.appearance.includes('"bottomStyle":"skirt"')
          && b?.appearance.includes('"hairColor":"blonde"')
          && b?.appearance.includes('"skinTone":"skin-5"'))
      })).toBe(true)
      await expect.poll(() => page.evaluate(() => {
        const encoded = document.querySelector('[data-testid="game-canvas"]')
          ?.getAttribute('data-e2e-name-label-bounds')
        if (!encoded) return false
        const labels = JSON.parse(encoded) as Array<{
          left: number; right: number; top: number; bottom: number
        }>
        return labels.length === 2 && labels.every((a, index) =>
          labels.slice(index + 1).every(b =>
            a.right + 5 <= b.left || b.right + 5 <= a.left ||
            a.bottom + 5 <= b.top || b.bottom + 5 <= a.top))
      })).toBe(true)
      await expect.poll(() => page.evaluate(() => {
        const host = document.querySelector('[data-testid="game-canvas"]')
        const canvas = host?.querySelector('canvas')
        if (!host || !canvas) return false
        const a = host.getBoundingClientRect()
        const b = canvas.getBoundingClientRect()
        return Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2
          && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          && document.documentElement.scrollHeight <= window.innerHeight + 1
      })).toBe(true)
    }

    // Browser smoke: the radar still renders the already-authorized peer
    // on desktop, without an extra API call or an invented position.
    await expect(pageB.getByTestId('world-radar-peer')).toHaveCount(1)
    await expect(pageB.getByTestId('world-radar-chart')).toBeVisible()

    // Two different viewports render the same macro-cell scenery anchors.
    const readBackdrop = async (page: Page) => page.getByTestId('game-canvas').evaluate(element => {
      const serialized = element.getAttribute('data-e2e-woodland-landmarks')
      return serialized ? JSON.parse(serialized) as Array<{ key: string; kind: string; x: number; y: number }> : []
    })
    const mobileScenery = await readBackdrop(pageA)
    const desktopScenery = await readBackdrop(pageB)
    const desktopByKey = new Map(desktopScenery.map(landmark => [landmark.key, landmark]))
    const shared = mobileScenery.filter(landmark => desktopByKey.has(landmark.key))
    expect(shared.length).toBeGreaterThan(0)
    for (const landmark of shared) expect(desktopByKey.get(landmark.key)).toEqual(landmark)

    // Player coordinates still change only when acknowledged by world authority.
    const self = pageA.locator('[data-player-id="art-player-a"]')
    const oldX = Number(await self.getAttribute('data-player-x'))
    await pageA.getByTestId('game-canvas').locator('canvas').click()
    await pageA.keyboard.down('ArrowRight')
    await pageA.waitForTimeout(140)
    await pageA.keyboard.up('ArrowRight')
    await expect.poll(async () => Number(await self.getAttribute('data-player-x'))).toBeGreaterThan(oldX)
    // The same authoritative snapshot turns the *peer* on the other browser.
    await expect.poll(() => pageB.evaluate(() => {
      const encoded = document.querySelector('[data-testid="game-canvas"]')
        ?.getAttribute('data-e2e-avatar-facing')
      if (!encoded) return false
      const facing = JSON.parse(encoded) as Array<{
        playerId: string; facing: string; frontVisible: boolean; profileVisible: boolean
      }>
      return facing.some(item => item.playerId === 'art-player-a'
        && item.facing === 'east' && item.profileVisible && !item.frontVisible)
    })).toBe(true)
    // The local renderer must agree with the peer's server-owned facing.
    await expect.poll(() => pageA.evaluate(() => {
      const encoded = document.querySelector('[data-testid="game-canvas"]')
        ?.getAttribute('data-e2e-avatar-facing')
      if (!encoded) return false
      const facing = JSON.parse(encoded) as Array<{
        playerId: string; facing: string; frontVisible: boolean
        profileVisible: boolean; scaleX: number
      }>
      return facing.some(item => item.playerId === 'art-player-a'
        && item.facing === 'east' && !item.frontVisible
        && item.profileVisible && item.scaleX === 1)
    })).toBe(true)

    await pageA.evaluate(() => window.dispatchEvent(new Event('vuxo:e2e-reconnect')))
    await expect(pageA.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
    await expect.poll(() => pageA.evaluate(() => {
      const encoded = document.querySelector('[data-testid="game-canvas"]')
        ?.getAttribute('data-e2e-avatar-appearance')
      if (!encoded) return false
      const players = JSON.parse(encoded) as Array<{ playerId: string; appearance: string }>
      const self = players.find(player => player.playerId === 'art-player-a')
      const peer = players.find(player => player.playerId === 'art-player-b')
      // The attribute is JSON containing JSON strings: parse the outer
      // document before comparing decoded catalog values.
      return Boolean(self?.appearance.includes('"hairColor":"red"')
        && peer?.appearance.includes('"hairColor":"blonde"'))
    })).toBe(true)

    await info.attach('world-art-mobile-two-players', {
      body: await pageA.screenshot({ animations: 'disabled' }), contentType: 'image/png',
    })
    await info.attach('world-art-desktop-two-players', {
      body: await pageB.screenshot({ animations: 'disabled' }), contentType: 'image/png',
    })
  } finally {
    await Promise.all([a.close(), b.close()])
  }
})

test('server-owned walking drives stride while reduced-motion remains static, including live preference change', async ({ page, request }, info) => {
  await resetRoom(request, strideScope)
  await demoPlayer(page, 'stride-player', 'Stride Wanderer', strideScope)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(gameUrl)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  const host = page.getByTestId('game-canvas')
  const self = page.locator('[data-player-id="stride-player"]')

  const pose = async () => host.evaluate(element => {
    const encoded = element.getAttribute('data-e2e-avatar-motion')
    if (!encoded) return null
    const frames = JSON.parse(encoded) as Array<{
      playerId: string; moving: boolean; bob: number
      walkedFrames: number; reducedWalkFrames: number
    }>
    return frames.find(entry => entry.playerId === 'stride-player') ?? null
  })

  await expect.poll(async () => (await pose())?.moving).toBe(false)
  await expect.poll(async () => (await pose())?.bob).toBe(0)
  const start = Number(await self.getAttribute('data-player-x'))
  await host.locator('canvas').click()
  await page.keyboard.down('ArrowRight')
  await expect.poll(async () => Number(await self.getAttribute('data-player-x'))).toBeGreaterThan(start)
  // A single real-time target update may generate only a few visible
  // frames. Assert that the renderer observed those frames (monotonic E2E
  // evidence), not that a 100ms Playwright poll lands on one exact frame.
  await expect.poll(async () => (await pose())?.walkedFrames ?? 0)
    .toBeGreaterThan(0)

  await info.attach('moving-avatar-normal-motion', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })

  // A browser preference change during travel must stop only the decorative
  // stride, not the world-authoritative movement or avatar appearance.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(async () => (await pose())?.bob).toBe(0)
  // Make a NEW, acknowledged movement request under reduced-motion. The
  // browser mock can apply a single snapshot per change of intent.
  await page.keyboard.up('ArrowRight')
  const beforeReducedTravel = Number(await self.getAttribute('data-player-x'))
  const reducedWalkFrames = (await pose())?.reducedWalkFrames ?? 0
  await page.keyboard.down('ArrowLeft')
  await expect.poll(async () => Number(await self.getAttribute('data-player-x')))
    .toBeLessThan(beforeReducedTravel)
  await expect.poll(async () => (await pose())?.reducedWalkFrames ?? 0)
    .toBeGreaterThan(reducedWalkFrames)
  await page.keyboard.up('ArrowLeft')
  await expect.poll(async () => (await pose())?.moving).toBe(false)
  await expect.poll(async () => (await pose())?.bob).toBe(0)
  await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '1')
  await expect(host.locator('canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true)
})

test('canonical server target turns avatars north, east, south and west with actual profile/back layers', async ({ page, request }, info) => {
  await resetRoom(request, facingScope)
  await demoPlayer(page, 'facing-player', 'Four Winds', facingScope)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(gameUrl)

  const host = page.getByTestId('game-canvas')
  const self = page.locator('[data-player-id="facing-player"]')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(host).toHaveAttribute('data-e2e-world-art-version', 'vuxo-world-art-v4')
  const facing = async () => host.evaluate(element => {
    const encoded = element.getAttribute('data-e2e-avatar-facing')
    if (!encoded) return null
    const snapshots = JSON.parse(encoded) as Array<{
      playerId: string; facing: string; frontVisible: boolean
      rearVisible: boolean; profileVisible: boolean; scaleX: number
    }>
    return snapshots.find(item => item.playerId === 'facing-player') ?? null
  })

  await expect.poll(async () => (await facing())?.facing).toBe('south')
  expect((await facing())?.frontVisible).toBe(true)
  expect((await facing())?.rearVisible).toBe(false)
  expect((await facing())?.profileVisible).toBe(false)
  await host.locator('canvas').click()
  const turns = [
    { key: 'ArrowUp', coordinate: 'y', toward: 'less', direction: 'north', front: false, rear: true, side: false, scaleX: 1 },
    { key: 'ArrowRight', coordinate: 'x', toward: 'more', direction: 'east', front: false, rear: false, side: true, scaleX: 1 },
    { key: 'ArrowDown', coordinate: 'y', toward: 'more', direction: 'south', front: true, rear: false, side: false, scaleX: 1 },
    { key: 'ArrowLeft', coordinate: 'x', toward: 'less', direction: 'west', front: false, rear: false, side: true, scaleX: -1 },
  ] as const
  for (const turn of turns) {
    const coordinateAttribute = turn.coordinate === 'x' ? 'data-player-x' : 'data-player-y'
    const before = Number(await self.getAttribute(coordinateAttribute))
    await page.keyboard.down(turn.key)
    await expect.poll(async () => {
      const after = Number(await self.getAttribute(coordinateAttribute))
      return turn.toward === 'less' ? after < before : after > before
    }).toBe(true)
    await expect.poll(async () => (await facing())?.facing).toBe(turn.direction)
    await page.keyboard.up(turn.key)
    const pose = await facing()
    expect(pose?.frontVisible).toBe(turn.front)
    expect(pose?.rearVisible).toBe(turn.rear)
    expect(pose?.profileVisible).toBe(turn.side)
    expect(pose?.scaleX).toBe(turn.scaleX)
    // Attach all four directions, not only the rear/left examples, so the
    // visual QA can compare that the south face is absent elsewhere.
    await info.attach('server-faced-' + turn.direction + '-390px', {
      body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
    })
  }
  const directionAfterMoving = (await facing())?.facing
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect.poll(async () => (await facing())?.facing).toBe(directionAfterMoving)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => (await facing())?.facing).toBe(directionAfterMoving)
  expect((await facing())?.frontVisible).toBe(false)
  await info.attach('server-faced-west-1280px', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })
  await expect(host.locator('canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true)
})

test('woodland landmarks persist at canonical coordinates across viewport resize and reload', async ({ page, request }, info) => {
  test.setTimeout(90_000)
  await resetRoom(request, landmarkScope)
  await demoPlayer(page, 'woodland-player', 'Woodland Guest', landmarkScope)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(gameUrl)

  const host = page.getByTestId('game-canvas')
  const self = page.locator('[data-player-id="woodland-player"]')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(host).toHaveAttribute('data-e2e-world-art-version', 'vuxo-world-art-v4')
  const landmarks = async () => host.evaluate(element => {
    const serialized = element.getAttribute('data-e2e-woodland-landmarks')
    return serialized ? JSON.parse(serialized) as Array<{
      key: string; kind: string; x: number; y: number
    }> : []
  })
  const anchors = new Map<string, string>()
  const initialX = Number(await self.getAttribute('data-player-x'))
  const initialY = Number(await self.getAttribute('data-player-y'))
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 3440, height: 1440 },
  ]) {
    await page.setViewportSize(viewport)
    await expect.poll(async () => (await landmarks()).length).toBeGreaterThan(1)
    const current = await landmarks()
    expect(current.length).toBeLessThan(100)
    expect(new Set(current.map(item => item.key)).size).toBe(current.length)
    for (const item of current) {
      expect(['fallen-log', 'fern-thicket', 'moss-glade']).toContain(item.kind)
      expect(Math.abs(item.x % 32)).toBe(0)
      expect(Math.abs(item.y % 32)).toBe(0)
      const signature = JSON.stringify({ kind: item.kind, x: item.x, y: item.y })
      expect(anchors.get(item.key) ?? signature).toBe(signature)
      anchors.set(item.key, signature)
    }
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1 &&
      document.documentElement.scrollHeight <= window.innerHeight + 1
    )).toBe(true)
    expect(Number(await self.getAttribute('data-player-x'))).toBe(initialX)
    expect(Number(await self.getAttribute('data-player-y'))).toBe(initialY)
    if (viewport.width === 390 || viewport.width === 1280 || viewport.width === 3440) {
      await info.attach('woodland-landmarks-' + viewport.width, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect.poll(async () => (await landmarks()).length).toBeGreaterThan(1)
  for (const item of await landmarks()) {
    const before = anchors.get(item.key)
    if (before) expect(JSON.stringify({ kind: item.kind, x: item.x, y: item.y })).toBe(before)
  }
})

test('illustrated world keeps the canvas responsive on a portrait-to-ultrawide resize', async ({ page, request }, info) => {
  await resetRoom(request, resizeScope)
  const future = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + resizeScope, {
    data: { playerId: 'art-resize-player', characterName: 'Landscape Wanderer',
      appearance: { catalogVersion: 'future-unknown', hairColor: 'red' } },
  })
  expect(future.ok()).toBeTruthy()
  await demoPlayer(page, 'art-resize-player', 'Landscape Wanderer', resizeScope)
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(gameUrl)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
  await expect.poll(() => page.getByTestId('game-canvas').getAttribute('data-e2e-avatar-appearance'))
    .toContain('"appearance":"legacy"')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('[data-testid="game-canvas"]')!.getBoundingClientRect()
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"] canvas')!
    const rect = canvas.getBoundingClientRect()
    return Math.abs(host.width - rect.width) <= 2 && Math.abs(host.height - rect.height) <= 2
      && canvas.width > canvas.height
  })).toBe(true)
  await info.attach('world-art-wide', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })
})

test('E2E world scopes isolate players, movement and resets across parallel scenarios', async ({ request }) => {
  await resetRoom(request, 'world-art-room-a')
  await resetRoom(request, 'world-art-room-b')
  for (const [scope, playerId] of [['world-art-room-a', 'isolated-a'], ['world-art-room-b', 'isolated-b']] as const) {
    const joined = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + scope, {
      data: { playerId, characterName: playerId },
    })
    expect(joined.ok()).toBeTruthy()
  }
  const state = async (scope: string) => {
    const response = await request.get(origin + '/__vuxo_e2e/world/state?scope=' + scope)
    expect(response.ok()).toBeTruthy()
    return (await response.json() as { players: Array<{ playerId: string; x: number }> }).players
  }
  expect((await state('world-art-room-a')).map(player => player.playerId)).toEqual(['isolated-a'])
  expect((await state('world-art-room-b')).map(player => player.playerId)).toEqual(['isolated-b'])
  const moved = await request.post(origin + '/__vuxo_e2e/world/intent?scope=world-art-room-b', {
    data: { playerId: 'isolated-b', horizontal: 1, vertical: 0 },
  })
  expect(moved.ok()).toBeTruthy()
  expect((await state('world-art-room-a'))[0].x).toBe(4.5)
  expect((await state('world-art-room-b'))[0].x).toBeGreaterThan(4.5)
  await resetRoom(request, 'world-art-room-a')
  expect(await state('world-art-room-a')).toEqual([])
  expect((await state('world-art-room-b')).map(player => player.playerId)).toEqual(['isolated-b'])
})

const cameraScope = 'world-art-camera'

test('adaptive camera keeps two canonical outfits, viewport HUD and movement stable across mobile-to-ultrawide resize', async ({ page, request }, info) => {
  test.setTimeout(90_000)
  await resetRoom(request, cameraScope)
  const fixtures = [
  {
    "playerId": "camera-self",
    "characterName": "Sun Wanderer",
    "appearance": {
      "catalogVersion": "0.0.1",
      "hairStyle": "hair-4",
      "hairColor": "red",
      "face": "face-2",
      "bodyType": "body-1",
      "skinTone": "skin-3",
      "topColor": "green",
      "bottomStyle": "skirt",
      "bottomColor": "white",
      "shoeStyle": "shoe-2",
      "shoeColor": "blue"
    }
  },
  {
    "playerId": "camera-peer",
    "characterName": "Moon Wanderer",
    "appearance": {
      "catalogVersion": "0.0.1",
      "hairStyle": "hair-2",
      "hairColor": "blonde",
      "face": "face-1",
      "bodyType": "body-3",
      "skinTone": "skin-5",
      "topColor": "red",
      "bottomStyle": "shorts",
      "bottomColor": "black",
      "shoeStyle": "shoe-1",
      "shoeColor": "white"
    }
  }
]
  for (const fixture of fixtures) {
    const seeded = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + cameraScope, { data: fixture })
    expect(seeded.ok()).toBeTruthy()
  }
  await demoPlayer(page, 'camera-self', 'Sun Wanderer', cameraScope)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(gameUrl)

  const host = page.getByTestId('game-canvas')
  const self = page.locator('[data-player-id="camera-self"]')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '2')
  await expect(self).toBeVisible()

  const samples = [
    { width: 320, height: 568, min: 1, max: 1 },
    { width: 390, height: 844, min: 1, max: 1 },
    { width: 768, height: 1024, min: 1, max: 1.16 },
    { width: 1280, height: 720, min: 1.1, max: 1.4 },
    { width: 1920, height: 1080, min: 1.4, max: 1.9 },
    { width: 3440, height: 1440, min: 1.75, max: 1.9 },
  ] as const
  const observed: number[] = []
  const originalX = Number(await self.getAttribute('data-player-x'))
  for (const sample of samples) {
    await page.setViewportSize({ width: sample.width, height: sample.height })
    await expect.poll(async () => {
      const zoom = Number(await host.getAttribute('data-e2e-camera-zoom'))
      return zoom >= sample.min && zoom <= sample.max
    }).toBe(true)
    const zoom = Number(await host.getAttribute('data-e2e-camera-zoom'))
    observed.push(zoom)
    await expect.poll(() => page.evaluate(() => {
      const surface = document.querySelector('[data-testid="game-canvas"]')!
      const canvas = surface.querySelector('canvas')!
      const a = surface.getBoundingClientRect()
      const b = canvas.getBoundingClientRect()
      return Math.abs(a.width - b.width) <= 2
        && Math.abs(a.height - b.height) <= 2
        && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        && document.documentElement.scrollHeight <= window.innerHeight + 1
        && document.scrollingElement!.scrollTop === 0
    })).toBe(true)
    // Terrain must cover Phaser's actual centered/zoomed worldView, not the
    // misleading scrollX/Y origin. This guards blank bars on ultrawide.
    await expect.poll(() => page.evaluate(() => {
      const host = document.querySelector('[data-testid="game-canvas"]')
      const canvas = host?.querySelector('canvas') as HTMLCanvasElement | null
      const encoded = host?.getAttribute('data-e2e-world-coverage')
      if (!canvas || !encoded) return false
      const coverage = JSON.parse(encoded) as {
        drawnLeft: number; drawnTop: number
        drawnRight: number; drawnBottom: number
        visibleLeft: number; visibleTop: number
        visibleRight: number; visibleBottom: number
      }
      const zoom = Number(host?.getAttribute('data-e2e-camera-zoom'))
      return Number.isFinite(zoom) && zoom >= 1
        && coverage.drawnLeft <= coverage.visibleLeft
        && coverage.drawnTop <= coverage.visibleTop
        && coverage.drawnRight >= coverage.visibleRight
        && coverage.drawnBottom >= coverage.visibleBottom
        && Math.abs((coverage.visibleRight - coverage.visibleLeft) * zoom - canvas.width) <= 4
        && Math.abs((coverage.visibleBottom - coverage.visibleTop) * zoom - canvas.height) <= 4
    })).toBe(true)
    await expect(page.getByTestId('world-connection-status')).toBeVisible()
    await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible()
    await expect(self).toHaveAttribute('data-player-x', String(originalX))
    if (sample.width === 390 || sample.width === 1920 || sample.width === 3440) {
      await info.attach('adaptive-world-' + sample.width + 'x' + sample.height, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      })
    }
  }
  expect(observed[0]).toBe(1)
  expect(observed[1]).toBe(1)
  expect(observed[4]).toBeGreaterThan(observed[3])
  expect(observed[5]).toBeGreaterThan(observed[4])

  // Camera resizing never grants movement: the mock world still owns tiles.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(host).toHaveAttribute('data-e2e-camera-zoom', '1')
  await page.getByTestId('game-canvas').locator('canvas').click()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(150)
  await page.keyboard.up('ArrowRight')
  await expect.poll(async () => Number(await self.getAttribute('data-player-x')))
    .toBeGreaterThan(originalX)
})



const zoomSeamScope = 'world-art-zoom-breakpoint-seams'

test('camera resize crosses the 600 and 1024 pixel seams without sudden scale jumps or blank terrain', async ({ page, request }, info) => {
  await resetRoom(request, zoomSeamScope)
  await demoPlayer(page, 'zoom-seam-self', 'Grove Scout', zoomSeamScope)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(gameUrl)
  const host = page.getByTestId('game-canvas')
  const self = page.getByTestId('world-presence-self')
  await expect(page.getByTestId('world-connection-status'))
    .toHaveAttribute('data-status', 'connected')
  await expect(host.locator('canvas')).toBeVisible()
  const initialX = await self.getAttribute('data-player-x')

  const zoomAt = async (width: number) => {
    await page.setViewportSize({ width, height: 800 })
    const dims = await host.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))
    const expected = computeWorldCameraZoom(dims.width, dims.height)
    await expect.poll(async () => Number(await host.getAttribute('data-e2e-camera-zoom')))
      .toBe(expected)
    await expect.poll(() => host.evaluate(el => {
      const canvas = el.querySelector('canvas') as HTMLCanvasElement | null
      const raw = el.getAttribute('data-e2e-world-coverage')
      if (!canvas || !raw) return false
      const coverage = JSON.parse(raw) as {
        drawnLeft: number; drawnRight: number; drawnTop: number; drawnBottom: number
        visibleLeft: number; visibleRight: number; visibleTop: number; visibleBottom: number
      }
      return coverage.drawnLeft <= coverage.visibleLeft
        && coverage.drawnRight >= coverage.visibleRight
        && coverage.drawnTop <= coverage.visibleTop
        && coverage.drawnBottom >= coverage.visibleBottom
        && Math.abs(canvas.width - el.clientWidth) < 2
        && Math.abs(canvas.height - el.clientHeight) < 2
    })).toBe(true)
    await expect(self).toHaveAttribute('data-player-x', initialX!)
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
      && document.documentElement.scrollHeight <= innerHeight + 1
    )).toBe(true)
    return expected
  }

  const mobileBefore = await zoomAt(599)
  const mobileAfter = await zoomAt(600)
  const desktopBefore = await zoomAt(1023)
  await info.attach('camera-before-1024px-seam', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })
  const desktopAfter = await zoomAt(1024)
  await info.attach('camera-after-1024px-seam', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  })
  expect(Math.abs(mobileAfter - mobileBefore)).toBeLessThanOrEqual(0.050001)
  expect(Math.abs(desktopAfter - desktopBefore)).toBeLessThanOrEqual(0.050001)
  await zoomAt(1280)
  await zoomAt(390)
  await expect(host).toHaveAttribute('data-e2e-camera-zoom', '1')
})

const ownLabelScope = 'world-art-self-name-priority'

test('self name keeps its avatar anchor when a nearby peer label overlaps on mobile and ultrawide', async ({ page, request }, info) => {
  await resetRoom(request, ownLabelScope)
  // The mock world assigns X by authoritative join order. The peer joins
  // first, left of self, so previous y/x ordering placed the peer label
  // first and pushed the local label one lane above its own avatar.
  for (const [playerId, characterName] of [
    ['a-nearby-peer', 'Ranger of the Evergreen Forest'],
    ['z-local-vuxian', 'Wanderer of the Midnight Grove'],
  ]) {
    const joined = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + ownLabelScope, {
      data: { playerId, characterName },
    })
    expect(joined.ok()).toBeTruthy()
  }
  await demoPlayer(page, 'z-local-vuxian', 'Wanderer of the Midnight Grove', ownLabelScope)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(gameUrl)
  const host = page.getByTestId('game-canvas')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(page.locator('[data-player-id="a-nearby-peer"]')).toBeVisible()
  await expect(page.getByTestId('world-presence-self')).toHaveAttribute('data-player-id', 'z-local-vuxian')

  const namePriorityIsCorrect = async () => host.evaluate(element => {
    const raw = element.getAttribute('data-e2e-name-label-bounds')
    if (!raw) return false
    const labels = JSON.parse(raw) as Array<{
      playerId: string; left: number; right: number; top: number; bottom: number
    }>
    const self = labels.find(label => label.playerId === 'z-local-vuxian')
    const peer = labels.find(label => label.playerId === 'a-nearby-peer')
    if (!self || !peer || labels.length !== 2) return false
    // Self is the first reserved lane; server's y=4.5 tile means
    // name baseline y=4.5*32 - 54 = 90, irrespective of camera zoom.
    const horizontallyOverlapping = self.left < peer.right + 6 && self.right > peer.left - 6
    return labels[0].playerId === 'z-local-vuxian'
      && Math.abs(self.bottom - 90) <= 1
      && horizontallyOverlapping
      && peer.bottom + 6 <= self.top
  })

  for (const viewport of [{ width: 390, height: 844 }, { width: 3440, height: 1440 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(namePriorityIsCorrect).toBe(true)
    await expect(host).toHaveAttribute('data-e2e-visible-avatar-count', '2')
    await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '2')
    await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1
      && document.documentElement.scrollHeight <= window.innerHeight + 1
    )).toBe(true)
    await info.attach('self-label-priority-' + viewport.width, {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
  }
})


const dualTouchScope = 'world-art-mobile-dual-touch'

test('two-finger D-pad movement keeps the world in viewport and server positions on mobile', async ({ page, request }, info) => {
  await resetRoom(request, dualTouchScope)
  await demoPlayer(page, 'art-dual-touch', 'Mobile Grove Scout', dualTouchScope)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(gameUrl)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  const self = page.locator('[data-player-id="art-dual-touch"]')
  const startX = Number(await self.getAttribute('data-player-x'))
  const startY = Number(await self.getAttribute('data-player-y'))
  const emit = async (direction: string, type: 'pointerdown' | 'pointerup', pointerId: number) =>
    page.getByTestId('touch-' + direction).evaluate((element, data) => {
      element.dispatchEvent(new PointerEvent(data.type, {
        bubbles: true, pointerId: data.pointerId, pointerType: 'touch',
      }))
    }, { type, pointerId })

  await emit('right', 'pointerdown', 31)
  await emit('up', 'pointerdown', 32)
  // The fixture moves only when it receives the combined intent. The client
  // has no write access to player x/y, camera position or movement speed.
  await expect.poll(async () => Number(await self.getAttribute('data-player-x'))).toBeGreaterThan(startX)
  await expect.poll(async () => Number(await self.getAttribute('data-player-y'))).toBeLessThan(startY)
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true)
  await info.attach('dual-finger-world-390x844', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })
  await emit('right', 'pointerup', 31)
  await emit('up', 'pointerup', 32)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
})

const cullingScope = 'world-art-visibility-resize'

test('offscreen peers stop animating and disappear from art only, then return on ultrawide without a new join', async ({ page, request }) => {
  test.setTimeout(90_000)
  await resetRoom(request, cullingScope)
  for (const [playerId, characterName] of [
    ['visibility-self', 'Grove Scout'], ['visibility-peer', 'Distant Ranger'],
  ]) {
    const joined = await request.post(origin + '/__vuxo_e2e/world/join?scope=' + cullingScope, {
      data: { playerId, characterName },
    })
    expect(joined.ok()).toBeTruthy()
  }
  await demoPlayer(page, 'visibility-self', 'Grove Scout', cullingScope)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 390, height: 844 })
  // Only the deterministic E2E fixture's server STATE is altered. Join
  // identity stays canonical; the production SignalR transport is untouched.
  // The far player is outside a phone view but inside an ultrawide view.
  await page.route(/\/__vuxo_e2e\/world\/state\?scope=world-art-visibility-resize$/, async route => {
    const response = await route.fetch()
    const payload = await response.json() as {
      players: Array<{ playerId: string; x: number; y: number }>
    }
    await route.fulfill({
      response,
      contentType: 'application/json',
      body: JSON.stringify({
        players: payload.players.map(player => player.playerId === 'visibility-peer'
          ? { ...player, x: 28, y: 4.5 } : player),
      }),
    })
  })
  await page.goto(gameUrl)
  const host = page.getByTestId('game-canvas')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '2')
  await expect.poll(async () => host.getAttribute('data-e2e-visible-avatar-ids'))
    .toBe(JSON.stringify(['visibility-self']))
  await expect(host).toHaveAttribute('data-e2e-visible-avatar-count', '1')
  // The peer remains in server-owned presence, but not in the radar:
  // the radar intentionally caps peer markers at 12 tiles and starts
  // collapsed on a phone. Camera culling must not alter either rule.
  await expect(page.locator('[data-player-id="visibility-peer"]')).toBeVisible()
  const radar = page.getByTestId('world-radar')
  await expect(radar).toHaveAttribute('data-expanded', 'false')
  await page.getByTestId('world-radar-toggle').click()
  await expect(radar).toHaveAttribute('data-expanded', 'true')
  await expect(page.getByTestId('world-radar-chart')).toBeVisible()
  await expect(page.getByTestId('world-radar-peer')).toHaveCount(0)
  await expect.poll(() => host.evaluate(element => {
    const motion = element.getAttribute('data-e2e-avatar-motion')
    if (!motion) return false
    const peer = (JSON.parse(motion) as Array<{ playerId: string; bob: number }>)
      .find(item => item.playerId === 'visibility-peer')
    return peer?.bob === 0
  })).toBe(true)

  await page.setViewportSize({ width: 3440, height: 1440 })
  await expect.poll(async () => host.getAttribute('data-e2e-visible-avatar-ids'))
    .toBe(JSON.stringify(['visibility-peer', 'visibility-self']))
  await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '2')
  await expect.poll(() => host.evaluate(element =>
    JSON.parse(element.getAttribute('data-e2e-name-label-bounds') ?? '[]').length,
  )).toBe(2)
  // Camera widening makes the peer visible on canvas, not nearer in world
  // coordinates: the radar stays limited to the same 12-tile range.
  await expect(page.getByTestId('world-radar-chart')).toBeVisible()
  await expect(page.getByTestId('world-radar-peer')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => host.getAttribute('data-e2e-visible-avatar-ids'))
    .toBe(JSON.stringify(['visibility-self']))
  await expect(host).toHaveAttribute('data-e2e-illustrated-player-count', '2')
  await expect(page.locator('[data-player-id="visibility-peer"]')).toBeVisible()
  await expect(page.getByTestId('world-radar-peer')).toHaveCount(0)
})

const terrainScope = 'world-art-terrain-buffer'

test('server-owned movement reuses terrain and resize repaints the cached window', async ({ page, request }) => {
  await resetRoom(request, terrainScope)
  await demoPlayer(page, 'terrain-player', 'Terrain Explorer', terrainScope)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(gameUrl)
  const host = page.getByTestId('game-canvas')
  const self = page.locator('[data-player-id="terrain-player"]')
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect.poll(async () => Number(await host.getAttribute('data-e2e-terrain-redraws'))).toBeGreaterThan(0)
  await page.waitForTimeout(250) // initial server-owned camera follow settles before sampling
  const before = Number(await host.getAttribute('data-e2e-terrain-redraws'))
  const x = Number(await self.getAttribute('data-player-x'))
  await host.locator('canvas').click()
  await page.keyboard.down('ArrowRight')
  await expect.poll(async () => Number(await self.getAttribute('data-player-x'))).toBeGreaterThan(x)
  await page.keyboard.up('ArrowRight')
  await expect.poll(async () => host.evaluate(element => {
    const data = element.getAttribute('data-e2e-world-coverage')
    if (!data) return false
    const c = JSON.parse(data) as Record<string, number>
    return c.drawnLeft <= c.visibleLeft && c.drawnRight >= c.visibleRight
      && c.drawnTop <= c.visibleTop && c.drawnBottom >= c.visibleBottom
  })).toBe(true)
  expect(Number(await host.getAttribute('data-e2e-terrain-redraws'))).toBe(before)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(async () => Number(await host.getAttribute('data-e2e-terrain-redraws'))).toBeGreaterThan(before)
  await expect(host.locator('canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true)
})
