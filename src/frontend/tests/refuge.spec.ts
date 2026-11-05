import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('home and desktop navigation lead to Refuge without downloading Phaser', async ({ page }) => {
  const gameChunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js/.test(new URL(request.url()).pathname)) gameChunks.push(request.url());
  });
  await page.goto('./#/');
  await page.getByTestId('home-refuge-link').click();
  await expect(page).toHaveURL(/#\/refuge$/);
  await expect(page.getByTestId('refuge-page')).toBeVisible();
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-care')).toContainText('In progettazione');
  await expect(page.getByTestId('refuge-care').getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('desktop-nav').locator('a[href="#/refuge"]')).toBeVisible();
  expect(gameChunks).toHaveLength(0);
});

test('anonymous player can complete local rune practice with no game API requests', async ({ page }) => {
  const gameCalls: string[] = [];
  page.on('request', request => {
    if (/\/api\/(characters|inventory|equipment|portals|world)\b/.test(new URL(request.url()).pathname)) {
      gameCalls.push(request.url());
    }
  });
  await page.goto('./#/refuge');
  await page.getByTestId('refuge-start-training').click();
  await expect(page.getByTestId('rune-training-page')).toBeVisible();
  await expect(page.getByTestId('training-disclaimer')).toContainText('nessun premio');
  const sequence = await page.getByTestId('training-preview-rune').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-rune')!)
  );
  expect(sequence).toHaveLength(4);
  await page.getByTestId('training-ready').click();
  await expect(page.getByTestId('training-check')).toBeDisabled();
  for (const rune of sequence) {
    await page.getByTestId('training-rune-' + rune).click();
  }
  await expect(page.getByTestId('training-check')).toBeEnabled();
  await page.getByTestId('training-check').click();
  await expect(page.getByTestId('training-success')).toBeVisible();
  expect(gameCalls).toEqual([]);
  await page.getByTestId('training-again').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(4);
});

test('wrong sequence shows feedback and difficulty changes the number of runes', async ({ page }) => {
  await page.goto('./#/refuge/training');
  await page.getByTestId('training-difficulty-easy').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(3);
  const first = await page.getByTestId('training-preview-rune').first().getAttribute('data-rune');
  const wrong = first === 'sun' ? 'moon' : 'sun';
  await page.getByTestId('training-ready').click();
  for (let index = 0; index < 3; index++) {
    await page.getByTestId('training-rune-' + wrong).click();
  }
  await page.getByTestId('training-check').click();
  await expect(page.getByTestId('training-failure')).toBeVisible();
  await page.getByTestId('training-difficulty-hard').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(6);
  await expect(page.getByTestId('training-result')).toHaveCount(0);
});

for (const width of [320, 390]) {
  test('Refuge and training remain usable on mobile ' + width + 'px, in English dark mode', async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/refuge');
    await page.getByTestId('mobile-menu-toggle').click();
    await expect(page.getByTestId('mobile-nav').locator('a[href="#/refuge"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('language-toggle').click();
    await expect(page.getByRole('heading', { name: 'Your Refuge' })).toBeVisible();
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-toggle').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await page.getByTestId('refuge-start-training').click();
    await expect(page.getByRole('heading', { name: 'Rune memory' })).toBeVisible();
    await expect(page.getByTestId('training-disclaimer')).toContainText('no rewards');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test('signed in Refuge shows player without claiming care or backend rewards', async ({ page }) => {
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  // Simulate login without a reload: this exercises the shared session hook
  // rather than getting cleared by the per-navigation test initializer.
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'e2e.jwt.placeholder');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'visitor', displayName: 'Guest Hero', email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-welcome')).toContainText('Guest Hero');
  await expect(page.getByTestId('refuge-guest')).toHaveCount(0);
  await expect(page.getByTestId('refuge-activity-inventory')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-activity-portals')).toHaveAttribute('href', '#/portals');
});
