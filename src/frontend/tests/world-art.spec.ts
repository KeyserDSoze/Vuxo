import { expect, test, type Page } from '@playwright/test'

const origin = 'http://127.0.0.1:4173'
const gameUrl = origin + '/Vuxo/#/game'

// Real browser + deterministic local two-peer world. No client-written
// positions, server appearance, rewards or production credentials.
// Unlike the legacy test world, these scenarios never reset the shared
// default room used by other parallel Playwright workers.
const duoScope = 'world-art-duo'
const resizeScope = 'world-art-resize'

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

    for (const page of [pageA, pageB]) {
      await expect(page.locator('[data-player-id="art-player-a"]')).toBeVisible()
      await expect(page.locator('[data-player-id="art-player-b"]')).toBeVisible()
      await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
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

    // Player coordinates still change only when acknowledged by world authority.
    const self = pageA.locator('[data-player-id="art-player-a"]')
    const oldX = Number(await self.getAttribute('data-player-x'))
    await pageA.getByTestId('game-canvas').locator('canvas').click()
    await pageA.keyboard.down('ArrowRight')
    await pageA.waitForTimeout(140)
    await pageA.keyboard.up('ArrowRight')
    await expect.poll(async () => Number(await self.getAttribute('data-player-x'))).toBeGreaterThan(oldX)

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
