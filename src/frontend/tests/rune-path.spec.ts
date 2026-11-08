import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

async function step(page: Page, direction: 'up' | 'down' | 'left' | 'right', times = 1) {
  for (let i = 0; i < times; i++) {
    await page.getByTestId('path-step-' + direction).click();
  }
}

test('guest solves all three 2D rune paths; walls and borders never move the character', async ({ page }) => {
  const gameplayRequests: string[] = [];
  const gameBundles: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(characters|inventory|equipment|portals|world|personal-content)\b/.test(path)) {
      gameplayRequests.push(request.url());
    }
    if (/\/assets\/GamePage-[^/]+\.js/.test(path)) gameBundles.push(request.url());
  });

  await page.goto('./#/refuge');
  await page.getByTestId('refuge-activity-path').click();
  await expect(page.getByTestId('rune-path-page')).toBeVisible();
  await expect(page.getByTestId('path-disclaimer')).toContainText('niente premi');

  await page.getByTestId('path-start').click();
  await expect(page.getByTestId('path-board').locator('button')).toHaveCount(16);
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 1');
  await expect(page.getByTestId('path-cell-1-0')).toBeDisabled();
  await expect(page.getByTestId('path-cell-3-3')).toBeDisabled();
  await step(page, 'right'); // Wall at (1,0).
  await step(page, 'up'); // Border.
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 1');
  await expect(page.getByTestId('path-bumps')).toContainText('2');
  await expect(page.getByTestId('path-moves')).toContainText('0');

  // First map leaves the bottom row open.
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-moves')).toContainText('6');
  await expect(page.getByTestId('path-puzzle')).toContainText('1 di 3');

  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-ready')).toBeVisible();
  await expect(page.getByTestId('path-puzzle')).toContainText('2 di 3');
  await page.getByTestId('path-start').click();
  // Second map leaves the top row and far-right column open.
  await step(page, 'right', 3);
  await step(page, 'down', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-bumps')).toContainText('0');

  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-puzzle')).toContainText('3 di 3');
  await page.getByTestId('path-start').click();
  // Last map requires turning inside the maze.
  await step(page, 'down', 2);
  await step(page, 'right', 2);
  await step(page, 'down');
  await step(page, 'right');
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-next')).toContainText('Ricomincia');
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-puzzle')).toContainText('1 di 3');
  await expect(page.getByTestId('path-ready')).toBeVisible();
  expect(gameplayRequests).toEqual([]);
  expect(gameBundles).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /path|score|reward/.test(key)))).toEqual([]);
});

test('mobile English dark puzzle supports keyboard arrows, wall feedback and accessible tile taps', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('./#/refuge/path');
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByRole('heading', { name: 'Rune path' })).toBeVisible();
  await expect(page.getByTestId('path-disclaimer')).toContainText('no rewards');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.getByTestId('path-start').click();
  const board = page.getByTestId('path-board');
  await expect(board).toHaveAttribute('aria-label', 'Path grid');
  await board.focus();
  await board.press('ArrowDown');
  await expect(page.getByTestId('path-position')).toContainText('column 1, row 2');
  await board.press('ArrowRight'); // (1,1) is a wall, position must not change.
  await expect(page.getByTestId('path-bumps')).toContainText('1');
  await expect(page.getByTestId('path-position')).toContainText('column 1, row 2');
  await expect(page.getByTestId('path-cell-1-1')).toBeDisabled();
  await page.getByTestId('path-cell-0-2').click();
  await expect(page.getByTestId('path-position')).toContainText('column 1, row 3');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.getByTestId('path-back').click();
  await page.getByTestId('refuge-activity-path').click();
  await expect(page.getByTestId('path-puzzle')).toContainText('Path 1 of 3');
  await expect(page.getByTestId('path-ready')).toBeVisible();
});

test('adjacent tiles are touch-accessible and a completed board stays locked until next puzzle', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./#/refuge/path');
  await page.getByTestId('path-start').click();
  await expect(page.getByTestId('path-cell-1-0')).toBeDisabled();
  await expect(page.getByTestId('path-cell-0-2')).toBeDisabled();
  await page.getByTestId('path-cell-0-1').click();
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 2');
  await expect(page.getByTestId('path-cell-1-1')).toBeDisabled();
  await page.getByTestId('path-cell-0-2').click();
  await page.getByTestId('path-cell-0-3').click();
  await page.getByTestId('path-cell-1-3').click();
  await page.getByTestId('path-cell-2-3').click();
  await page.getByTestId('path-cell-3-3').click();
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-moves')).toContainText('6');
  await expect(page.getByTestId('path-cell-3-3')).toBeDisabled();
  await page.getByTestId('path-board').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('path-position')).toContainText('colonna 4, riga 4');
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-ready')).toBeVisible();
  await expect(page.getByTestId('path-puzzle')).toContainText('2 di 3');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key =>
    /path|score|reward/i.test(key)))).toEqual([]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('undo reverts only valid moves, and restart clears attempts on the same path without saving results', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const gameplayRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/(characters|inventory|equipment|portals|world|personal-content)\b/.test(new URL(request.url()).pathname)) {
      gameplayRequests.push(request.url());
    }
  });
  await page.goto('./#/refuge/path');
  await page.getByTestId('path-start').click();
  await expect(page.getByTestId('path-undo')).toBeDisabled();

  await step(page, 'right'); // Wall collision cannot be undone as a valid step.
  await expect(page.getByTestId('path-bumps')).toContainText('1');
  await expect(page.getByTestId('path-undo')).toBeDisabled();

  await step(page, 'down', 2);
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 3');
  await expect(page.getByTestId('path-moves')).toContainText('2');
  await page.getByTestId('path-undo').click();
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 2');
  await expect(page.getByTestId('path-moves')).toContainText('1');
  await expect(page.getByTestId('path-bumps')).toContainText('1');
  await page.getByTestId('path-undo').click();
  await expect(page.getByTestId('path-undo')).toBeDisabled();
  await expect(page.getByTestId('path-moves')).toContainText('0');

  await page.getByTestId('path-restart').click();
  await expect(page.getByTestId('path-bumps')).toContainText('0');
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 1');
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-undo')).toHaveCount(0);

  await page.getByTestId('path-restart').click();
  await expect(page.getByTestId('path-puzzle')).toContainText('1 di 3');
  await expect(page.getByTestId('path-complete')).toHaveCount(0);
  await expect(page.getByTestId('path-moves')).toContainText('0');
  await expect(page.getByTestId('path-undo')).toBeDisabled();

  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('path-undo')).toHaveText('Undo last move');
  await expect(page.getByTestId('path-restart')).toHaveText('Restart this path');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(gameplayRequests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /path|score|reward/i.test(key)))).toEqual([]);
});
