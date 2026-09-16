import { expect, test } from '@playwright/test';

test('home exposes the first playable milestone', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: /primo mondo di vuxo/i })).toBeVisible();
});

test('phaser game route renders a canvas', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
});
