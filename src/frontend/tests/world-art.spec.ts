import { expect, test, type Page } from '@playwright/test'

const origin = 'http://127.0.0.1:4173'
const gameUrl = origin + '/Vuxo/#/game'

// Real browser + deterministic local two-peer world. No client-written
// positions, server appearance, rewards or production credentials.
test.beforeEach(async ({ request }) => {
  const result = await request.post(origin + '/__vuxo_e2e/world/reset')
  expect(result.ok()).toBeTruthy()
})

async function demoPlayer(page: Page, id: string, name: string) {
  await page.addInitScript(({ id, name }) => {
    localStorage.setItem('vuxo.e2ePlayerId', id)
    localStorage.setItem('vuxo.e2eCharacterName', name)
    localStorage.setItem('vuxo.language', 'it')
    localStorage.setItem('vuxo.theme', 'dark')
  }, { id, name })
}

test('two illustrated wanderers coexist in the authoritative world at mobile size', async ({ browser }, info) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const b = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  try {
    const pageA = await a.newPage()
    const pageB = await b.newPage()
    await demoPlayer(pageA, 'art-player-a', 'Grove Wanderer')
    await demoPlayer(pageB, 'art-player-b', 'Moon Wanderer')
    await pageA.goto(gameUrl)
    await expect(pageA.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
    await pageB.goto(gameUrl)
    await expect(pageB.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')

    for (const page of [pageA, pageB]) {
      await expect(page.locator('[data-player-id="art-player-a"]')).toBeVisible()
      await expect(page.locator('[data-player-id="art-player-b"]')).toBeVisible()
      await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
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

test('illustrated world keeps the canvas responsive on a portrait-to-ultrawide resize', async ({ page }, info) => {
  await demoPlayer(page, 'art-resize-player', 'Landscape Wanderer')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(gameUrl)
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected')
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
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
