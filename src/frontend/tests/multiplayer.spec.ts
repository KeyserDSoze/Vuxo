import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const previewOrigin = 'http://127.0.0.1:4173';
const gameUrl = `${previewOrigin}/Vuxo/#/game`;

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${previewOrigin}/__vuxo_e2e/world/reset`);
  expect(response.ok()).toBeTruthy();
});

test('keyboard sends movement intent and authoritative position comes back', async ({ page }) => {
  await configurePlayer(page, 'keyboard-player', 'Keyboard Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="keyboard-player"]');
  await expect(player).toBeVisible();
  const initialX = await numericAttribute(player, 'data-player-x');

  await page.getByTestId('game-canvas').locator('canvas').click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.up('ArrowRight');

  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(initialX);
});

test('world HUD reflects the same authoritative speed as the player snapshot', async ({ page }) => {
  await configurePlayer(page, 'speed-hud-player', 'Speed Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const self = page.locator('[data-player-id="speed-hud-player"]');
  const speed = page.getByTestId('world-speed');
  await expect(self).toBeVisible();
  await expect(speed).toBeVisible();
  await expect.poll(async () => speed.getAttribute('data-speed'))
    .toBe(await self.getAttribute('data-player-speed'));
  await expect(speed).toContainText('Velocità in tempo reale');
});

test('client re-joins after a simulated reconnect without losing presence', async ({ page }) => {
  await configurePlayer(page, 'reconnect-player', 'Reconnect Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="reconnect-player"]');
  await expect(player).toBeVisible();
  const initialX = await numericAttribute(player, 'data-player-x');

  await page.evaluate(() => window.dispatchEvent(new Event('vuxo:e2e-reconnect')));
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'reconnecting');
  await expectConnected(page);

  await expect(player).toBeVisible();
  expect(await numericAttribute(player, 'data-player-x')).toBe(initialX);
});

test('two browser contexts see reciprocal player presence', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await configurePlayer(pageA, 'player-a', 'Alpha');
    await configurePlayer(pageB, 'player-b', 'Bravo');

    await pageA.goto(gameUrl);
    await expectConnected(pageA);
    await pageB.goto(gameUrl);
    await expectConnected(pageB);

    await expect(pageA.locator('[data-player-id="player-b"]')).toHaveText('Bravo');
    await expect(pageB.locator('[data-player-id="player-a"]')).toHaveText('Alpha');
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});

test('mobile viewport exposes touch controls and touch movement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurePlayer(page, 'touch-player', 'Touch Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="touch-player"]');
  const initialX = await numericAttribute(player, 'data-player-x');

  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('touch-controls')).toBeVisible();
  await expect(page.getByTestId('touch-right')).toBeVisible();

  await page.getByTestId('touch-right').dispatchEvent('pointerdown');
  await page.waitForTimeout(100);
  await page.getByTestId('touch-right').dispatchEvent('pointerup');

  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(initialX);
});

async function configurePlayer(page: Page, playerId: string, characterName: string): Promise<void> {
  await page.addInitScript(({ id, name }) => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.e2ePlayerId', id);
    localStorage.setItem('vuxo.e2eCharacterName', name);
  }, { id: playerId, name: characterName });
}

async function expectConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
}

async function numericAttribute(locator: ReturnType<Page['locator']>, name: string): Promise<number> {
  const value = await locator.getAttribute(name);
  if (value === null) throw new Error(`Missing ${name}`);
  return Number(value);
}
