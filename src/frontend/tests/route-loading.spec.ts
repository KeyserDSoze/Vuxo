import { expect, test } from '@playwright/test';

test('home does not eagerly download Phaser route; navigating to game fetches it', async ({ page }) => {
  const gameChunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js(?:\?.*)?$/.test(new URL(request.url()).pathname)) {
      gameChunks.push(request.url());
    }
  });

  await page.goto('./#/');
  await expect(page.getByTestId('home-hero')).toBeVisible();
  expect(gameChunks).toHaveLength(0);
  await page.getByTestId('desktop-nav').locator('a[href="#/game"]').click();
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  expect(gameChunks.length).toBeGreaterThan(0);
  await page.getByTestId('desktop-nav').locator('a[href="#/"]').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
});

test('direct game navigation still mounts Phaser and retains shell controls', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('language-toggle')).toBeVisible();
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
});
