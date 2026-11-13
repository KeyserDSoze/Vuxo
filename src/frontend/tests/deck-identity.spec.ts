import { expect, test, type Page } from '@playwright/test';
import { expectNoDocumentScroll, mockOwnerApi, preparePlayer } from './support/vuxoFixtures';

// #233/#234: one deck for every off-world screen, with the shared runic
// night identity, without decorative layers ever stealing focus or motion.
const deckLinks = ['refuge', 'character', 'inventory', 'portals', 'game'] as const;

const chambers = [
  { path: '/refuge/journal', page: 'journal', it: 'Diario', en: 'Journal' },
  { path: '/refuge/training', page: 'training', it: 'Memoria delle rune', en: 'Rune memory' },
  { path: '/refuge/reflex', page: 'reflex', it: 'Riflessi', en: 'Reflexes' },
  { path: '/refuge/path', page: 'path', it: 'Percorso delle rune', en: 'Rune path' },
] as const;

async function activeLinks(page: Page) {
  return page.getByTestId('game-deck-navigation').locator('.vuxo-deck__route[aria-current]').evaluateAll(links =>
    links.map(link => link.getAttribute('data-testid') + '=' + link.getAttribute('aria-current')));
}

for (const chamber of chambers) {
  test(`${chamber.path} keeps the Refuge lit and shows a localized breadcrumb`, async ({ page }) => {
    await preparePlayer(page, { role: 'User' });
    await mockOwnerApi(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./#' + chamber.path);
    await expect(page.getByTestId('game-deck')).toHaveAttribute('data-route', 'refuge');
    await expect(page.getByTestId('game-deck')).toHaveAttribute('data-page', chamber.page);
    expect(await activeLinks(page)).toEqual(['game-deck-link-refuge=true']);
    await expect(page.getByTestId('game-deck-current')).toHaveText(chamber.it);
    await expect(page.getByTestId('game-deck-scroll')).toHaveAttribute('aria-label', chamber.it);
    await expect(page.getByRole('navigation', { name: 'Dove ti trovi' })).toBeVisible();

    await page.getByTestId('language-toggle').click();
    await expect(page.getByTestId('game-deck-current')).toHaveText(chamber.en);
    await expect(page.getByRole('navigation', { name: 'You are here' })).toBeVisible();

    const parent = page.getByTestId('game-deck-parent');
    await expect(parent).toHaveText('Refuge');
    // The breadcrumb follows the rail in keyboard order.
    await page.getByTestId('game-deck-link-game').focus();
    await page.keyboard.press('Tab');
    await expect(parent).toBeFocused();
    await expect(parent).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/refuge$/);
    await expect(page.getByTestId('game-deck-link-refuge')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('game-deck-parent')).toHaveCount(0);
  });
}

for (const system of [
  { path: '/auth', page: 'auth', label: 'Account', ready: 'auth-page' },
  { path: '/admin', page: 'admin', label: 'Admin', ready: 'admin-dashboard' },
  { path: '/version', page: 'version', label: 'Versione', ready: 'version-page' },
] as const) {
  test(`${system.path} lives in the deck without lighting a false destination`, async ({ page }) => {
    await preparePlayer(page, { role: 'Administrator' });
    await mockOwnerApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#' + system.path);
    await expect(page.getByTestId(system.ready)).toBeVisible();
    await expect(page.getByTestId('game-deck')).toHaveAttribute('data-page', system.page);
    await expect(page.getByTestId('game-deck-current')).toHaveText(system.label);
    expect(await activeLinks(page)).toEqual([]);
    for (const name of deckLinks) await expect(page.getByTestId('game-deck-link-' + name)).toHaveAttribute('data-active', 'false');
    await expectNoDocumentScroll(page);
  });
}

test('the night sky is decorative: hidden from assistive tech and transparent to the pointer', async ({ page }) => {
  await preparePlayer(page, { role: 'User' });
  await mockOwnerApi(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/refuge');
  const sky = page.getByTestId('game-deck-sky');
  await expect(sky).toHaveAttribute('aria-hidden', 'true');
  await expect(sky).toHaveCSS('pointer-events', 'none');
  await expect(sky.locator('.vuxo-deck__star')).toHaveCount(28);
  await expect(sky.locator('.vuxo-deck__constellation')).toBeVisible();
  // The rail stays clickable above the sky.
  await page.getByTestId('game-deck-link-inventory').click();
  await expect(page).toHaveURL(/#\/inventory$/);
});

test('the deck sky follows the selected theme while panels stay readable', async ({ page }) => {
  await preparePlayer(page, { theme: 'light', role: 'User' });
  await mockOwnerApi(page);
  await page.goto('./#/refuge/journal');
  const skyTop = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--vuxo-sky-top').trim());
  await expect.poll(skyTop).toBe('#122045');
  const panel = page.getByTestId('game-deck-scroll');
  await expect(panel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByTestId('theme-toggle').click(); // light -> dark
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect.poll(skyTop).toBe('#060f28');
  await expect(panel).toHaveCSS('background-color', 'rgb(16, 24, 39)');
});

test('screens rise with the runic reveal and every ambient animation stops with reduced motion', async ({ page }) => {
  await preparePlayer(page, { role: 'User' });
  await mockOwnerApi(page);
  await page.goto('./#/refuge');
  const pageLayer = page.locator('.vuxo-deck__page');
  await expect(pageLayer).toHaveCSS('animation-name', 'vuxo-deck-reveal');
  await expect(page.locator('.vuxo-deck__star--twinkle').first()).toHaveCSS('animation-name', 'vuxo-deck-twinkle');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pageLayer).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.vuxo-deck__star--twinkle').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.vuxo-deck__aurora')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.vuxo-deck__comet')).toBeHidden();
  const pseudoAnimations = await page.evaluate(() => [
    getComputedStyle(document.querySelector('.vuxo-deck__sigil > span')!, '::after').animationName,
    getComputedStyle(document.querySelector('.vuxo-shell-brand-rune')!, '::after').animationName,
  ]);
  expect(pseudoAnimations).toEqual(['none', 'none']);
});

const titledScreens = [
  '/refuge', '/refuge/journal', '/refuge/training', '/refuge/reflex', '/refuge/path',
  '/character', '/inventory', '/portals', '/auth', '/admin', '/version',
] as const;

test('every deck screen title shares the runic ink and falls back to system colours in forced-colors mode', async ({ page }) => {
  await preparePlayer(page, { role: 'Administrator' });
  await mockOwnerApi(page);
  for (const path of titledScreens) {
    await test.step(path, async () => {
      await page.goto('./#' + path);
      const title = page.locator('.vuxo-deck__page h1').first();
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
      await expect(title).toHaveCSS('background-image', /linear-gradient/);
    });
  }
  await page.emulateMedia({ forcedColors: 'active' });
  const title = page.locator('.vuxo-deck__page h1').first();
  await expect(title).toHaveCSS('background-image', 'none');
  await expect(title).not.toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
});

test('deck screens without a bespoke hero share the runic page header', async ({ page }) => {
  await preparePlayer(page, { role: 'Administrator' });
  await mockOwnerApi(page);
  for (const path of ['/refuge/journal', '/refuge/training', '/refuge/reflex', '/refuge/path', '/inventory', '/auth', '/admin', '/version']) {
    await page.goto('./#' + path);
    const header = page.locator('.vuxo-page-header');
    await expect(header, path).toHaveCount(1);
    await expect(header.locator('h1'), path).toHaveCount(1);
    await expect(header.locator('.vuxo-page-header__sigil'), path).toHaveAttribute('aria-hidden', 'true');
  }
});

test('a lazily loaded chamber shows its loading state inside the deck while the rail stays usable', async ({ page }) => {
  await preparePlayer(page, { role: 'User' });
  await mockOwnerApi(page, { awards: 2 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/RefugeJournalPage-*.js', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('game-deck-loading')).toBeVisible();
  await expect(page.getByTestId('game-deck-navigation')).toBeVisible();
  await expect(page.getByTestId('route-loading')).toHaveCount(0);
  await expect(page.getByTestId('game-deck-current')).toHaveText('Diario');
  await expectNoDocumentScroll(page);
  release();
  await expect(page.getByTestId('refuge-journal-page')).toBeVisible();
  await expect(page.getByTestId('game-deck-loading')).toHaveCount(0);
});

test('the character portrait has a localized accessible name (#236)', async ({ page }) => {
  await preparePlayer(page);
  await mockOwnerApi(page);
  await page.goto('./#/character');
  await expect(page.getByRole('img', { name: 'Ritratto illustrato del tuo Vuxian' })).toBeVisible();
  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('img', { name: 'Illustrated portrait of your Vuxian' })).toBeVisible();
});
