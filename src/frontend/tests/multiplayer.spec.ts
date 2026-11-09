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

test('blur stops keyboard travel, rejects a stale held key and resumes only after a new press', async ({ page }) => {
  await configurePlayer(page, 'blur-player', 'Focus Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="blur-player"]');
  const initialX = await numericAttribute(player, 'data-player-x');
  await page.getByTestId('game-canvas').locator('canvas').click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(initialX);

  // A browser can lose keyup while the key is still physically held.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(300);
  const stoppedX = await numericAttribute(player, 'data-player-x');
  await page.waitForTimeout(250);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);

  // Restoring focus must not replay the old keydown.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(250);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(stoppedX);
  await page.keyboard.up('ArrowRight');
});

test('leaving the touch direction with mouse pressed stops movement on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurePlayer(page, 'touch-leave-player', 'Touch Exit Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="touch-leave-player"]');
  const initialX = await numericAttribute(player, 'data-player-x');
  const right = page.getByTestId('touch-right');
  await right.hover();
  await page.mouse.down();
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(initialX);

  // Move out while pressed: pointerup is delivered to the canvas, not button.
  await page.mouse.move(240, 400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const stoppedX = await numericAttribute(player, 'data-player-x');
  await page.waitForTimeout(250);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);

  await right.dispatchEvent('pointerdown');
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(stoppedX);
  await right.dispatchEvent('pointercancel');
});

test('touch remains neutral across blur, disabled input and fresh focus press', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurePlayer(page, 'touch-focus-player', 'Touch Focus Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);

  const player = page.locator('[data-player-id="touch-focus-player"]');
  const right = page.getByTestId('touch-right');
  await expect(right).toBeEnabled();
  const initialX = await numericAttribute(player, 'data-player-x');
  await right.dispatchEvent('pointerdown');
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(initialX);

  // No pointerup is delivered when a tab/window loses focus.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(right).toBeDisabled();
  await page.waitForTimeout(180);
  const stoppedX = await numericAttribute(player, 'data-player-x');
  await page.waitForTimeout(230);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);

  // Even a synthetic pointerdown cannot resume a blurred touch controller.
  await right.dispatchEvent('pointerdown');
  await page.waitForTimeout(200);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(right).toBeEnabled();
  await page.waitForTimeout(160);
  expect(await numericAttribute(player, 'data-player-x')).toBe(stoppedX);

  // A fresh press, not the former held pointer, can resume movement.
  await right.dispatchEvent('pointerdown');
  await expect.poll(() => numericAttribute(player, 'data-player-x')).toBeGreaterThan(stoppedX);
  await right.dispatchEvent('pointerup');
});

test('touch direction buttons are disabled during a reconnect and restored afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configurePlayer(page, 'touch-reconnect-player', 'Reconnect Touch Vuxian');
  await page.goto(gameUrl);
  await expectConnected(page);
  const right = page.getByTestId('touch-right');
  await expect(right).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('vuxo:e2e-reconnect')));
  await expect(page.getByTestId('world-connection-status'))
    .toHaveAttribute('data-status', 'reconnecting');
  await expect(right).toBeDisabled();
  await expectConnected(page);
  await expect(right).toBeEnabled();
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
