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

    // No new subscription/endpoint: radar only uses the same live peer
    // snapshots as presence; the self position remains fixed at the center.
    const peerOnA = pageA.getByTestId('world-radar-peer');
    const peerOnB = pageB.getByTestId('world-radar-peer');
    await expect(peerOnA).toHaveCount(1);
    await expect(peerOnB).toHaveCount(1);
    await expect(pageA.getByTestId('world-radar-self')).toHaveAttribute('cx', '72');
    const initialX = Number(await peerOnA.getAttribute('cx'));
    await pageB.getByTestId('game-canvas').locator('canvas').click();
    await pageB.keyboard.down('ArrowRight');
    await expect.poll(async () => Number(await peerOnA.getAttribute('cx'))).toBeGreaterThan(initialX);
    await pageB.keyboard.up('ArrowRight');
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


test('multi-touch D-pad sends diagonals, retains the remaining finger and drops stale pointers on blur', async ({ page, request }) => {
  const scope = 'touch-multitouch'
  const reset = await request.post(`${previewOrigin}/__vuxo_e2e/world/reset?scope=${scope}`)
  expect(reset.ok()).toBeTruthy()
  await page.setViewportSize({ width: 390, height: 844 })
  await configurePlayer(page, 'multitouch-player', 'Two Finger Vuxian')
  await page.addInitScript(scope => localStorage.setItem('vuxo.e2eWorldScope', scope), scope)
  const sent: Array<[number, number]> = []
  page.on('request', request => {
    if (!request.url().includes('/__vuxo_e2e/world/intent?scope=' + scope)) return
    const value = request.postDataJSON() as { horizontal: number; vertical: number }
    sent.push([value.horizontal, value.vertical])
  })
  await page.goto(gameUrl)
  await expectConnected(page)
  const player = page.locator('[data-player-id="multitouch-player"]')
  const startingY = await numericAttribute(player, 'data-player-y')

  const pointer = async (direction: string, type: 'pointerdown' | 'pointerup' | 'pointercancel', id: number) => {
    await page.getByTestId('touch-' + direction).evaluate((element, details) => {
      element.dispatchEvent(new PointerEvent(details.type, {
        bubbles: true, pointerType: 'touch', pointerId: details.id,
      }))
    }, { type, id })
  }
  const expectLast = async (horizontal: number, vertical: number) =>
    expect.poll(() => sent.at(-1)).toEqual([horizontal, vertical])

  await pointer('right', 'pointerdown', 11)
  await expectLast(1, 0)
  await pointer('up', 'pointerdown', 22)
  await expectLast(1, -1)
  await expect.poll(() => numericAttribute(player, 'data-player-y')).toBeLessThan(startingY)
  // A different/late pointerup cannot cancel either still-held finger.
  const beforeUnknown = sent.length
  await pointer('left', 'pointerup', 99)
  expect(sent).toHaveLength(beforeUnknown)
  await pointer('right', 'pointerup', 11)
  await expectLast(0, -1)
  await pointer('up', 'pointerup', 22)
  await expectLast(0, 0)

  // Two opposite held directions cancel, releasing one resumes the other.
  await pointer('left', 'pointerdown', 33)
  await expectLast(-1, 0)
  await pointer('right', 'pointerdown', 44)
  await expectLast(0, 0)
  await pointer('left', 'pointerup', 33)
  await expectLast(1, 0)
  await pointer('right', 'pointercancel', 44)
  await expectLast(0, 0)

  // Focus loss clears the pointer map immediately, not only the outgoing
  // intent. Neither a late pointerup nor focus restoration replays the hold.
  await pointer('up', 'pointerdown', 55)
  await expectLast(0, -1)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByTestId('touch-up')).toBeDisabled()
  await expectLast(0, 0)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByTestId('touch-up')).toBeEnabled()
  const beforeStale = sent.length
  await pointer('up', 'pointerup', 55)
  expect(sent).toHaveLength(beforeStale)
  await pointer('down', 'pointerdown', 66)
  await expectLast(0, 1)
  await pointer('down', 'pointerup', 66)
  await expectLast(0, 0)

  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true)
})

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
