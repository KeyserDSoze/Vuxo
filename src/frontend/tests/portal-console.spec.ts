import { expect, test, type Page } from '@playwright/test';

const grantId = '11111111-1111-4111-8111-111111111111';
const secret = ['sun', 'moon', 'star', 'wave'];
const grant = { id: grantId, contentKey: 'portal.memory.grove', portalKey: 'challenge.sequence.v1', expiresAtUtc: null };
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function login(page: Page, language: 'it' | 'en' = 'it') {
  const expiresAtUtc = new Date(Date.now() + 3_600_000).toISOString();
  await page.addInitScript(({ expiresAtUtc, language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.accessToken', 'portal-console-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'portal-player', displayName: 'Runic Hero', email: null }));
  }, { expiresAtUtc, language });
}

async function mockPortal(page: Page) {
  const posts: string[][] = [];
  let consumed = false;
  await page.route('**/api/personal-content**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (req.method() === 'GET' && path === '/api/personal-content')
      return route.fulfill({ json: consumed ? [] : [grant], headers: corsHeaders });
    if (req.method() === 'GET' && path.endsWith('/challenge'))
      return route.fulfill({ json: { grantId, version: 'portal-sequence-v1', sequence: secret }, headers: corsHeaders });
    if (req.method() === 'POST' && path.endsWith('/challenge/attempt')) {
      const submitted = (req.postDataJSON() as { sequence: string[] }).sequence;
      posts.push(submitted);
      if (JSON.stringify(submitted) !== JSON.stringify(secret))
        return route.fulfill({ status: 422, json: { code: 'portal_challenge_incorrect' }, headers: corsHeaders });
      consumed = true;
      return route.fulfill({ json: { id: grantId, consumedAtUtc: '2026-11-04T00:00:00Z' }, headers: corsHeaders });
    }
    return route.fulfill({ status: 404 });
  });
  return posts;
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440]] as const) {
  test(`personal portal console is responsive at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await login(page);
    await mockPortal(page);
    await page.goto('./#/portals');
    await expect(page.getByTestId('portal-console-hero')).toBeVisible();
    await expect(page.getByTestId('portal-console-count')).toContainText('1');
    await expect(page.getByTestId('portal-console-gateway')).toHaveCount(1);
    await expect(page.getByTestId('portal-start')).toHaveAttribute('type', 'button');
    await expect.poll(() => page.evaluate(() => {
      const html = document.documentElement;
      const deck = document.querySelector('[data-testid="game-deck"]')!.getBoundingClientRect();
      return html.scrollWidth <= html.clientWidth + 1 && html.scrollHeight <= window.innerHeight + 1
        && deck.top >= 0 && deck.bottom <= window.innerHeight + 1;
    })).toBe(true);
    if (width === 390 || width === 1280) {
      await info.attach(`portal-console-${width}x${height}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  });
}

test('only the entered runes appear after preview, and only submit invokes the server attempt', async ({ page }) => {
  await login(page);
  const attempts = await mockPortal(page);
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-console-phase')).toContainText('Memorizza');
  await expect(page.getByTestId('portal-preview')).toContainText('Sole');
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  await expect(page.getByTestId('portal-console-phase')).toContainText('Ripeti');
  await expect(page.getByTestId('portal-answer-slots').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('portal-answer-slots')).not.toContainText('Sole');
  await expect(page.getByTestId('portal-answer-slots')).not.toContainText('Luna');
  await expect(page.getByTestId('portal-submit')).toBeDisabled();

  await page.getByTestId('portal-rune-moon').click();
  await expect(page.getByTestId('portal-answer-slot-0')).toContainText('Luna');
  await expect(page.getByTestId('portal-answer-slot-1')).not.toContainText('Sole');
  await expect(page.getByTestId('portal-progress')).toContainText('1 / 4');
  expect(attempts).toEqual([]);

  await page.getByRole('button', { name: 'Ricomincia' }).click();
  await expect(page.getByTestId('portal-answer-slots')).not.toContainText('Luna');
  for (const rune of secret) await page.getByTestId('portal-rune-' + rune).click();
  await expect(page.getByTestId('portal-progress')).toContainText('4 / 4');
  expect(attempts).toEqual([]);
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-complete')).toBeVisible();
  await expect(page.getByTestId('portal-console-phase')).toContainText('Confermata dal server');
  expect(attempts).toEqual([secret]);
});

test('English mobile rune pad and answer slots stay usable with dark theme and keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'en');
  await mockPortal(page);
  await page.goto('./#/portals');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  await expect(page.getByTestId('portal-console-phase')).toContainText('Repeat');
  const moon = page.getByTestId('portal-rune-moon');
  await moon.focus();
  await expect(moon).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('portal-answer-slot-0')).toContainText('Moon');
  await expect(page.getByTestId('portal-answer-slot-1')).toHaveAttribute('aria-label', 'Not entered yet');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});

test('portal keyboard enters runes 1–4, Backspace undo and Enter submits once after preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const attempts = await mockPortal(page);
  await page.goto('./#/portals');
  // Key presses outside the arena cannot enter or submit anything.
  await page.keyboard.press('1');
  expect(attempts).toEqual([]);
  await page.getByTestId('portal-start').click();
  const arena = page.getByTestId('portal-challenge');
  await expect(page.getByTestId('portal-preview')).toBeVisible();
  await arena.focus();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  expect(attempts).toEqual([]);
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  await expect(arena).toBeFocused();
  await expect(page.getByTestId('portal-keyboard-hint')).toContainText('Backspace');
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.getByTestId('portal-answer-slot-0')).toContainText('Sole');
  await expect(page.getByTestId('portal-answer-slot-1')).toContainText('Luna');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('portal-progress')).toContainText('1 / 4');
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await page.keyboard.press('4');
  await expect(page.getByTestId('portal-progress')).toContainText('4 / 4');
  expect(attempts).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('portal-complete')).toBeVisible();
  expect(attempts).toEqual([secret]);
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  expect(attempts).toEqual([secret]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1
    && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('rune hotkeys never steal native buttons, modifiers, other page focus or preview controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'en');
  const attempts = await mockPortal(page);
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  const arena = page.getByTestId('portal-challenge');
  await expect(arena).toBeFocused();
  await expect(page.getByTestId('portal-keyboard-hint')).toContainText('1 Sun');
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Alt+2');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('portal-progress')).toContainText('0 / 4');

  const moon = page.getByTestId('portal-rune-moon');
  await moon.focus();
  await page.keyboard.press('1');
  await expect(page.getByTestId('portal-progress')).toContainText('0 / 4');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('portal-answer-slot-0')).toContainText('Moon');
  await arena.focus();
  await page.keyboard.press('3');
  await expect(page.getByTestId('portal-progress')).toContainText('2 / 4');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('portal-progress')).toContainText('1 / 4');
  expect(attempts).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test('guest sees no server grant count or challenge controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const calls: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).pathname.startsWith('/api/personal-content')) calls.push(req.url());
  });
  await page.goto('./#/portals');
  await expect(page.getByTestId('portal-auth-required')).toBeVisible();
  await expect(page.getByTestId('portal-console-count')).toHaveCount(0);
  await expect(page.getByTestId('portal-console-gateway')).toHaveCount(0);
  await expect(page.getByTestId('portal-answer-slots')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('reduced-motion settings do not animate gateway cards on hover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await mockPortal(page);
  await page.goto('./#/portals');
  const gateway = page.getByTestId('portal-console-gateway');
  await expect(gateway).toHaveCSS('transition-duration', '0s');
  await gateway.hover();
  await expect(gateway).toHaveCSS('transform', 'none');
});
