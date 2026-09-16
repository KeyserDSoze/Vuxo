import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vuxo.language')) localStorage.setItem('vuxo.language', 'it');
    if (!localStorage.getItem('vuxo.theme')) localStorage.setItem('vuxo.theme', 'system');
  });
});

test('home exposes the first playable milestone', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /primo mondo di vuxo/i })).toBeVisible();
});

test('phaser game route renders a canvas', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
});

test('theme preference cycles and persists', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('light');
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.theme'))).toBe('light');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('language can switch to English and persists', async ({ page }) => {
  await page.goto('./#/');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { name: /first world of vuxo/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.language'))).toBe('en');
  await page.reload();
  await expect(page.getByRole('heading', { name: /first world of vuxo/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.language'))).toBe('en');
});
