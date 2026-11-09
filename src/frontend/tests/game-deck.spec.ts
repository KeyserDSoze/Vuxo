import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
  // The deck must remain usable when optional server-owned data is unavailable.
  await page.route('**/api/meta/character-appearance', route => route.fulfill({ status: 503 }));
});

const screens = [
  { path: '/refuge', key: 'refuge' },
  { path: '/inventory', key: 'inventory' },
  { path: '/character', key: 'character' },
  { path: '/portals', key: 'portals' },
] as const;
const viewports = [
  [320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440],
] as const;

for (const { path, key } of screens) {
  for (const [width, height] of viewports) {
    test(`game deck ${key} is viewport-native at ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.goto('./#' + path);
      await expect(page.getByTestId('game-deck')).toBeVisible();
      await expect(page.getByTestId('game-deck-link-' + key)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('game-deck-scroll')).toBeVisible();
      await expect(page.getByTestId('game-deck-link-game')).toHaveAttribute('href', '#/game');

      await expect.poll(() => page.evaluate(() => {
        const root = document.documentElement;
        const panel = document.querySelector('[data-testid="game-deck"]')!;
        const content = document.querySelector('[data-testid="game-deck-scroll"]')!;
        const rect = panel.getBoundingClientRect();
        return root.scrollWidth <= root.clientWidth + 1 &&
          root.scrollHeight <= window.innerHeight + 1 &&
          rect.top >= 0 && rect.bottom <= window.innerHeight + 1 &&
          content.clientHeight > 0 &&
          getComputedStyle(content).overflowY === 'auto';
      })).toBe(true);

      if ((width === 390 || width === 1280) && key === 'refuge') {
        await testInfo.attach(`game-deck-${key}-${width}x${height}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    });
  }
}

test('refuge action panels scroll inside the game deck, without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/refuge');
  const content = page.getByTestId('game-deck-scroll');
  await expect(page.getByTestId('refuge-care')).toBeAttached();
  await expect.poll(() => content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => content.evaluate(el => el.scrollTop > 0)).toBe(true);
  await expect(page.getByTestId('refuge-care')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
});

test('mobile deck updates the current route, keeps navigation visible and supports keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/refuge');
  const inventory = page.getByTestId('game-deck-link-inventory');
  await inventory.focus();
  await expect(inventory).toBeFocused();
  await expect(inventory).toHaveAttribute('href', '#/inventory');
  await inventory.click();
  await expect(page).toHaveURL(/#\/inventory$/);
  await expect(page.getByTestId('game-deck-link-inventory')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('game-deck-link-inventory')).toBeInViewport();
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
});

test('deck keeps IT/EN and dark mode localized while preserving its selected route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/inventory');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('game-deck-current')).toHaveText('Inventory');
  await expect(page.getByTestId('game-deck-link-inventory')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('game-deck-scroll')).toBeVisible();
});

test('world and home remain independent from the off-world deck', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByTestId('game-deck')).toHaveCount(0);
  await page.goto('./#/game');
  await expect(page.getByTestId('game-deck')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
});

test('reduced-motion deck keeps keyboard navigation without route hover movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/refuge');
  const inventory = page.getByTestId('game-deck-link-inventory');
  await expect(inventory).toHaveCSS('transition-duration', '0s');
  await inventory.focus();
  await expect(inventory).toBeFocused();
});
