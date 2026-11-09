import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080]] as const) {
  test(`the world fills the visible viewport at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./#/game');
    const canvas = page.getByTestId('game-canvas').locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();

    await expect.poll(async () => page.evaluate(() => {
      const surface = document.querySelector('[data-testid="game-canvas"]');
      const canvas = surface?.querySelector('canvas');
      if (!surface || !canvas) return false;
      const surfaceRect = surface.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const pageHeight = document.documentElement.scrollHeight;
      return surfaceRect.width > 0 && surfaceRect.height > 0 &&
        Math.abs(surfaceRect.width - canvasRect.width) <= 2 &&
        Math.abs(surfaceRect.height - canvasRect.height) <= 2 &&
        pageHeight <= window.innerHeight + 1 &&
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    })).toBe(true);

    if (width < 900) await expect(page.getByTestId('touch-controls')).toBeVisible();
  });
}

test('resizing the browser reveals a different amount of world without a 16:9 letterbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/game');
  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(canvas).toBeVisible();

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect.poll(async () => page.evaluate(() => {
    const host = document.querySelector('[data-testid="game-canvas"]')!;
    const canvas = host.querySelector('canvas')!;
    return Math.abs(canvas.getBoundingClientRect().height - host.getBoundingClientRect().height) <= 2 &&
      Math.abs(canvas.getBoundingClientRect().width - host.getBoundingClientRect().width) <= 2 &&
      canvas.height > canvas.width;
  })).toBe(true);
});

test('fullscreen button and F shortcut request browser fullscreen without hiding the HUD', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
    Object.defineProperty(shell, 'requestFullscreen', {
      configurable: true,
      value: () => {
        document.body.dataset.fullscreenRequestCount = String(Number(document.body.dataset.fullscreenRequestCount ?? 0) + 1);
        return Promise.resolve();
      },
    });
  });

  await page.getByTestId('game-fullscreen-toggle').click();
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(1);
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => Number(document.body.dataset.fullscreenRequestCount ?? 0))).toBe(2);
  await expect(page.getByTestId('world-connection-status')).toBeVisible();
});

test('fullscreen denial reports an actionable localized warning', async ({ page }) => {
  await page.goto('./#/game');
  await expect(page.getByTestId('game-fullscreen-toggle')).toBeVisible();

  await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="game-shell"]') as HTMLElement;
    Object.defineProperty(shell, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('Browser denied fullscreen')),
    });
  });

  await page.getByTestId('game-fullscreen-toggle').click();
  await expect(page.getByTestId('game-fullscreen-error')).toContainText('Schermo intero non disponibile');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('game-fullscreen-error')).toContainText('Fullscreen is unavailable');
});
