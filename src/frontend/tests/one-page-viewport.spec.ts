import { expect, test } from '@playwright/test';
import {
  expectBoundedDeckPanel, expectNoDocumentScroll, mockOwnerApi, preparePlayer, viewports,
  type Language, type Role, type Theme,
} from './support/vuxoFixtures';

// #233/#235: VUXO is a one-page game. No route may ever scroll the document,
// at any supported viewport, for guests or for players with long content.
const routes = [
  { path: '/', ready: 'home-screen', deck: false },
  { path: '/game', ready: 'game-canvas', deck: false },
  { path: '/refuge', ready: 'refuge-page', deck: true },
  { path: '/refuge/journal', ready: 'refuge-journal-page', deck: true },
  { path: '/refuge/training', ready: 'rune-training-page', deck: true },
  { path: '/refuge/reflex', ready: 'reflex-training-page', deck: true },
  { path: '/refuge/path', ready: 'rune-path-page', deck: true },
  { path: '/character', ready: 'character-editor-page', deck: true },
  { path: '/inventory', ready: 'inventory-page', deck: true },
  { path: '/portals', ready: 'portal-page', deck: true },
  { path: '/auth', ready: 'auth-page', deck: true },
  { path: '/admin', ready: 'admin-dashboard', deck: true },
  { path: '/version', ready: 'version-page', deck: true },
] as const;

const variants: ReadonlyArray<{ name: string; language: Language; theme: Theme; role: Role | null }> = [
  { name: 'administrator IT dark with long content', language: 'it', theme: 'dark', role: 'Administrator' },
  { name: 'guest EN light', language: 'en', theme: 'light', role: null },
];

for (const variant of variants) {
  for (const route of routes) {
    // A guest only sees the access notice on /admin; it must fit as well.
    const ready = route.path === '/admin' && !variant.role ? 'admin-access-denied' : route.ready;
    test(`${route.path} never scrolls the document (${variant.name})`, async ({ page }) => {
      test.slow(route.path === '/game');
      await preparePlayer(page, { ...variant, reducedMotion: true, worldScope: 'one-page-matrix' });
      await mockOwnerApi(page, { awards: 40, events: 20 });
      for (const [width, height] of viewports) {
        await test.step(`${width}x${height}`, async () => {
          await page.setViewportSize({ width, height });
          await page.goto('./#' + route.path);
          await expect(page.getByTestId(ready)).toBeVisible();
          await expectNoDocumentScroll(page);
          if (route.deck) await expectBoundedDeckPanel(page);
        });
      }
    });
  }
}

const longScreens = [
  { path: '/refuge/journal', item: 'refuge-journal-reward', count: 40, end: 'refuge-journal-show-completed' },
  { path: '/inventory', item: 'inventory-item', count: 12, end: 'inventory-journal-more' },
  { path: '/admin', item: 'admin-event-row', count: 20, end: 'admin-page-next' },
] as const;

for (const screen of longScreens) {
  for (const [width, height] of [[320, 568], [1280, 720]] as const) {
    test(`${screen.path} long content scrolls only inside the deck panel at ${width}x${height}`, async ({ page }) => {
      await preparePlayer(page, { role: 'Administrator', reducedMotion: true });
      await mockOwnerApi(page, { awards: 40, events: 20 });
      await page.setViewportSize({ width, height });
      await page.goto('./#' + screen.path);
      const panel = page.getByTestId('game-deck-scroll');
      const items = page.getByTestId(screen.item);
      await expect(items).toHaveCount(screen.count);
      await expect.poll(() => panel.evaluate(el => el.scrollHeight > el.clientHeight + 40)).toBe(true);

      // Wheel over the panel moves the panel, never the document.
      await panel.hover();
      await page.mouse.wheel(0, 900);
      await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

      // Keyboard players reach the end of the list through the focusable region.
      await panel.focus();
      await expect(panel).toBeFocused();
      await page.keyboard.press('End');
      await expect.poll(() => panel.evaluate(el => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2)).toBe(true);
      await expect(page.getByTestId(screen.end)).toBeInViewport();
      await expectNoDocumentScroll(page);
    });
  }
}

test('rotating a phone between portrait and landscape never creates document scroll', async ({ page }) => {
  await preparePlayer(page, { role: 'User', reducedMotion: true });
  await mockOwnerApi(page, { awards: 40 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward').first()).toBeVisible();
  for (const [width, height] of [[844, 390], [390, 844], [568, 320]] as const) {
    await page.setViewportSize({ width, height });
    await expectNoDocumentScroll(page);
    await expectBoundedDeckPanel(page);
  }
});

test('route changes inside the deck reset the panel to the top and keep the document still', async ({ page }) => {
  await preparePlayer(page, { role: 'User', reducedMotion: true });
  await mockOwnerApi(page, { awards: 40 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/refuge/journal');
  const panel = page.getByTestId('game-deck-scroll');
  await expect(page.getByTestId('refuge-journal-reward').first()).toBeVisible();
  await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.getByTestId('game-deck-link-inventory').click();
  await expect(page.getByTestId('inventory-page')).toBeVisible();
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBe(0);
  await expectNoDocumentScroll(page);
});
