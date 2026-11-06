import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vuxo.language')) localStorage.setItem('vuxo.language', 'it');
    if (!localStorage.getItem('vuxo.theme')) localStorage.setItem('vuxo.theme', 'system');
  });
});

test('home exposes the first playable milestone', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /oltre il portale/i })).toBeVisible();
});

test('phaser game route renders a canvas', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
});

test('theme preference cycles system-light-dark and persists', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('light');
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('dark');
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('system');
});

test('language can switch to English and persists', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { name: /beyond the portal/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.language'))).toBe('en');
  await page.reload();
  await expect(page.getByRole('heading', { name: /beyond the portal/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.language'))).toBe('en');
});


test('unsupported stored language falls back to Italian and updates document language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.language', 'fr'));
  await page.goto('./#/');

  await expect(page.getByRole('heading', { name: /oltre il portale/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('it');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.language'))).toBe('it');
});

test('shell controls expose accessible labels and visible keyboard focus', async ({ page }) => {
  await page.goto('./#/');

  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-label', /Tema:/);
  await expect(page.getByTestId('language-toggle')).toHaveAttribute('aria-label', /Lingua:/);

  const home = page.getByRole('link', { name: 'Home' });
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();
  await expect.poll(() => home.evaluate(element => ({
    focusVisible: element.matches(':focus-visible'),
    outlineWidth: getComputedStyle(element).outlineWidth,
  }))).toEqual({ focusVisible: true, outlineWidth: '3px' });
});
