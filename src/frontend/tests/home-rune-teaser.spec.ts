import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
  await page.goto('./#/');
});

test('guest can awaken portal, decode its sigil and continue through auth', async ({ page }) => {
  await expect(page.getByTestId('home-rune-teaser')).toHaveCount(0);
  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-teaser')).toBeVisible();

  const preview = page.getByTestId('home-rune-preview-item');
  await expect(preview).toHaveCount(3);
  await expect(preview.nth(0)).toHaveAttribute('data-rune', 'sun');
  await expect(preview.nth(1)).toHaveAttribute('data-rune', 'star');
  await expect(preview.nth(2)).toHaveAttribute('data-rune', 'wave');

  await page.getByTestId('home-rune-start').click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('home-rune-progress')).toContainText('0 di 3');

  for (const rune of ['sun', 'star', 'wave']) {
    await page.getByTestId('home-rune-choice-' + rune).click();
  }
  await expect(page.getByTestId('home-rune-success')).toContainText('Sigillo aperto');
  await expect(page.getByTestId('home-rune-continue')).toHaveAttribute('href', '#/auth');
  await expect(page.getByTestId('home-rune-teaser')).toContainText('nessun premio, XP o progresso');

  await page.getByTestId('home-rune-continue').click();
  await expect(page).toHaveURL(/#\/auth$/);
});

test('rune slots, undo and portal victory visuals remain in sync', async ({ page }) => {
  const hero = page.getByTestId('home-hero');
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  await expect(hero).toHaveAttribute('data-sigil', 'answer');
  const slots = page.getByTestId('home-rune-slot');
  await expect(slots).toHaveCount(3);
  await expect(page.getByTestId('home-rune-undo')).toBeDisabled();

  await page.getByTestId('home-rune-choice-sun').click();
  await expect(slots.first()).toHaveAttribute('data-filled', 'true');
  await expect(slots.nth(1)).toHaveAttribute('data-filled', 'false');
  await page.getByTestId('home-rune-undo').click();
  await expect(slots.first()).toHaveAttribute('data-filled', 'false');
  await expect(page.getByTestId('home-rune-progress')).toContainText('0 di 3');

  for (const rune of ['sun', 'star', 'wave']) await page.getByTestId('home-rune-choice-' + rune).click();
  await expect(hero).toHaveAttribute('data-sigil', 'success');
  await expect(page.getByTestId('home-rune-success').getByRole('status')).toBeFocused();
  await page.getByTestId('home-rune-again').click();
  await expect(hero).toHaveAttribute('data-sigil', 'preview');
  await page.getByTestId('home-portal').click();
  await expect(hero).toHaveAttribute('data-sigil', 'idle');
});

test('wrong answer dims the portal and focuses accessible failure feedback', async ({ page }) => {
  const hero = page.getByTestId('home-hero');
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('home-rune-choice-moon').click();
  await expect(hero).toHaveAttribute('data-sigil', 'failure');
  await expect(page.getByTestId('home-rune-failure').getByRole('status')).toBeFocused();
  await page.getByTestId('home-rune-retry').click();
  await expect(hero).toHaveAttribute('data-sigil', 'preview');
});

test('wrong sigil reports failure, then lets the visitor memorize and retry', async ({ page }) => {
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  for (const rune of ['moon', 'moon', 'moon']) {
    await page.getByTestId('home-rune-choice-' + rune).click();
  }
  await expect(page.getByTestId('home-rune-failure').getByRole('status')).toBeVisible();
  await expect(page.getByTestId('home-rune-continue')).toHaveCount(0);

  await page.getByTestId('home-rune-retry').click();
  await expect(page.getByTestId('home-rune-preview-item')).toHaveCount(3);
  await page.getByTestId('home-rune-start').click();
  await expect(page.getByTestId('home-rune-progress')).toContainText('0 di 3');
});

test('switching paths and closing the portal reset the local challenge', async ({ page }) => {
  await page.getByTestId('home-realm-character').click();
  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-preview-item').first()).toHaveAttribute('data-rune', 'moon');
  await page.getByTestId('home-rune-start').click();
  await page.getByTestId('home-rune-choice-moon').click();
  await expect(page.getByTestId('home-rune-progress')).toContainText('1 di 3');

  await page.getByTestId('home-realm-portals').click();
  await expect(page.getByTestId('home-rune-teaser')).toHaveCount(0);
  await expect(page.getByTestId('home-hero')).toHaveAttribute('data-awake', 'false');
  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-preview-item').first()).toHaveAttribute('data-rune', 'wave');

  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-teaser')).toHaveCount(0);
  await page.getByTestId('home-portal').click();
  await expect(page.getByTestId('home-rune-preview-item')).toHaveCount(3);
});

test('home sigil numeric shortcuts stay in the focused arena with undo and native button input', async ({ page }) => {
  await page.getByTestId('home-portal').click();
  await page.keyboard.press('1');
  await expect(page.getByTestId('home-rune-preview')).toBeVisible();

  await page.getByTestId('home-rune-start').click();
  const arena = page.getByTestId('home-rune-answer');
  const progress = page.getByTestId('home-rune-progress');
  await expect(arena).toBeFocused();
  await expect(page.getByTestId('home-rune-keyboard-hint')).toContainText('1–4');
  await arena.dispatchEvent('keydown', { key: '1', ctrlKey: true, bubbles: true });
  await arena.dispatchEvent('keydown', { key: '1', altKey: true, bubbles: true });
  await arena.dispatchEvent('keydown', { key: '1', metaKey: true, bubbles: true });
  await expect(progress).toContainText('0 di 3');

  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(progress).toContainText('2 di 3');
  await page.keyboard.press('Backspace');
  await expect(progress).toContainText('1 di 3');
  await expect(page.getByTestId('home-rune-slot').nth(1)).toHaveAttribute('data-filled', 'false');

  await page.getByTestId('home-rune-choice-sun').focus();
  await page.keyboard.press('4');
  await expect(progress).toContainText('1 di 3');
  await page.getByTestId('home-rune-undo').focus();
  await page.keyboard.press('4');
  await expect(progress).toContainText('1 di 3');

  await arena.focus();
  await page.keyboard.press('3');
  await page.keyboard.press('4');
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
  await expect(page.getByTestId('home-rune-success').getByRole('status')).toBeFocused();
  await page.keyboard.press('1');
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
});

test('English dark mobile sigil shortcuts do not require mouse or external scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  await expect(page.getByTestId('home-rune-keyboard-hint')).toContainText('Backspace to undo');
  await expect(page.getByTestId('home-rune-answer')).toBeFocused();
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  await page.keyboard.press('4');
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('sigil is playable using keyboard alone', async ({ page }) => {
  await page.getByTestId('home-portal').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('home-rune-start').focus();
  await page.keyboard.press('Enter');
  for (const rune of ['sun', 'star', 'wave']) {
    const choice = page.getByTestId('home-rune-choice-' + rune);
    await choice.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
});

test('English teaser stays usable on a 320px dark mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.getByTestId('home-portal').click();
  await expect(page.getByRole('heading', { name: 'Decode the sigil' })).toBeVisible();
  await expect(page.getByTestId('home-rune-teaser')).toContainText('no rewards, XP or progress');
  await page.getByTestId('home-rune-start').click();
  await expect(page.getByTestId('home-rune-progress')).toContainText('0 of 3');
  await expect(page.getByTestId('home-rune-undo')).toHaveText('Undo last rune');
  await expect(page.getByTestId('home-rune-slot')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('reduced-motion setting keeps victory but disables portal victory animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  for (const rune of ['sun', 'star', 'wave']) await page.getByTestId('home-rune-choice-' + rune).click();
  await expect(page.getByTestId('home-hero')).toHaveAttribute('data-sigil', 'success');
  await expect(page.locator('.vuxo-landing__portal-ring--outer')).toHaveCSS('animation-name', 'none');
});

test('guest teaser does not start Phaser or send gameplay API requests', async ({ page }) => {
  const forbiddenRequests: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/\/api\/(activities|characters\/me|portals|world)/.test(pathname) ||
        /\/assets\/GamePage-[^/]+\.js$/.test(pathname)) {
      forbiddenRequests.push(pathname);
    }
  });
  await page.getByTestId('home-portal').click();
  await page.getByTestId('home-rune-start').click();
  for (const rune of ['sun', 'star', 'wave']) await page.getByTestId('home-rune-choice-' + rune).click();
  await expect(page.getByTestId('home-rune-success')).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});
