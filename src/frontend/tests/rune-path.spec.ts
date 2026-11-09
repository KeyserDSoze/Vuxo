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

test('hint finds a deterministic shortest move without changing position, moves or private gameplay state', async ({ page }) => {
  const gameplayRequests: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/\/api\/(characters|inventory|equipment|portals|world|personal-content)\b/.test(pathname)) {
      gameplayRequests.push(request.url());
    }
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('./#/refuge/path');
  await page.getByTestId('path-start').click();
  await expect(page.getByTestId('path-hint-feedback')).toHaveCount(0);

  await page.getByTestId('path-hint').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('Giù');
  await expect(page.getByTestId('path-hint-feedback')).toContainText('6 mosse');
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 1');
  await expect(page.getByTestId('path-moves')).toContainText('0');
  await step(page, 'down');
  await expect(page.getByTestId('path-hint-feedback')).toHaveCount(0);
  await page.getByTestId('path-hint').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('5 mosse');

  await step(page, 'right'); // Hitting a wall does not invalidate the same hint.
  await expect(page.getByTestId('path-hint-feedback')).toContainText('5 mosse');
  await expect(page.getByTestId('path-bumps')).toContainText('1');
  await page.getByTestId('path-undo').click();
  await expect(page.getByTestId('path-hint-feedback')).toHaveCount(0);
  await page.getByTestId('path-hint').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('6 mosse');

  await page.getByTestId('path-restart').click();
  await expect(page.getByTestId('path-hint-feedback')).toHaveCount(0);
  await expect(page.getByTestId('path-bumps')).toContainText('0');
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await expect(page.getByTestId('path-hint')).toHaveCount(0);

  await page.getByTestId('path-next').click();
  await page.getByTestId('path-start').click();
  await page.getByTestId('path-hint').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('Destra');
  await expect(page.getByTestId('path-hint-feedback')).toContainText('6 mosse');
  await step(page, 'right', 3);
  await step(page, 'down', 3);
  await page.getByTestId('path-next').click();
  await page.getByTestId('path-start').click();
  await page.getByTestId('path-hint').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('Giù');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('path-hint-feedback')).toContainText('Next direction: Down');
  await expect(page.getByTestId('path-hint-feedback')).toContainText('6 moves');
  await expect(page.getByTestId('path-hint')).toHaveText('Show a hint');
  await page.getByTestId('path-restart').click();
  await expect(page.getByTestId('path-hint-feedback')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  expect(gameplayRequests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key =>
    /path|score|reward|hint/i.test(key)))).toEqual([]);
});

const serverPracticeWalls = [
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
  [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 2 }],
];
function publicPracticePuzzle(index: number) {
  return {
    rulesVersion: 'rune-path-practice-v1', puzzleIndex: index, gridSize: 4,
    start: { x: 0, y: 0 }, goal: { x: 3, y: 3 }, walls: serverPracticeWalls[index],
  };
}

test('guest compares exact public practice geometry without cookies, tokens or gameplay mutation', async ({ page }) => {
  const calls: { path: string; method: string; auth: string | undefined; cookie: string | undefined }[] = [];
  await page.route('**/api/activities/rune-path/puzzles/*', route => {
    const request = route.request();
    calls.push({
      path: new URL(request.url()).pathname,
      method: request.method(),
      auth: request.headers().authorization,
      cookie: request.headers().cookie,
    });
    const index = Number(new URL(request.url()).pathname.split('/').pop());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(publicPracticePuzzle(index)) });
  });
  await page.goto('./#/refuge/path');
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'matched');
  await expect(page.getByTestId('path-rules-status')).toContainText('senza ricompense');
  await page.getByTestId('path-start').click();
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'matched');
  await expect(page.getByTestId('path-puzzle')).toContainText('2 di 3');
  expect(calls).toEqual([
    { path: '/api/activities/rune-path/puzzles/0', method: 'GET', auth: undefined, cookie: undefined },
    { path: '/api/activities/rune-path/puzzles/1', method: 'GET', auth: undefined, cookie: undefined },
  ]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /path|reward|score|xp/i.test(key)))).toEqual([]);
});

test('Cloudflare 502 keeps Rune Path playable offline in English without storing progress', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  let requests = 0;
  await page.route('**/api/activities/rune-path/puzzles/*', route => {
    requests += 1;
    return route.fulfill({ status: 502, body: 'Bad gateway' });
  });
  await page.goto('./#/refuge/path');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'local');
  await expect(page.getByTestId('path-rules-status')).toContainText('Keep playing the local board');
  await page.getByTestId('path-start').click();
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /path|reward|score|xp/i.test(key)))).toEqual([]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('mismatched version and altered walls fail closed but never block local play', async ({ page }) => {
  let mode: 'version' | 'wall' = 'version';
  await page.route('**/api/activities/rune-path/puzzles/*', route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').pop());
    const puzzle = publicPracticePuzzle(index);
    const bad = mode === 'version'
      ? { ...puzzle, rulesVersion: 'rune-path-practice-v999' }
      : { ...puzzle, walls: [puzzle.walls[0], puzzle.walls[0], ...puzzle.walls.slice(2)] };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(bad) });
  });
  await page.goto('./#/refuge/path');
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'local');
  await page.getByTestId('path-start').click();
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  mode = 'wall';
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'local');
  await expect(page.getByTestId('path-puzzle')).toContainText('2 di 3');
  await page.getByTestId('path-start').click();
  await step(page, 'right', 3);
  await step(page, 'down', 3);
  await expect(page.getByTestId('path-complete')).toBeVisible();
});

test('a late rules response from a previous puzzle never marks the next puzzle matched', async ({ page }) => {
  let releasePrevious!: () => void;
  let firstSeen = false;
  const hold = new Promise<void>(resolve => { releasePrevious = resolve; });
  await page.route('**/api/activities/rune-path/puzzles/*', async route => {
    const index = Number(new URL(route.request().url()).pathname.split('/').pop());
    if (index === 0) {
      firstSeen = true;
      await hold;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(publicPracticePuzzle(index)) }).catch(() => {});
      return;
    }
    await route.fulfill({ status: 503 });
  });
  await page.goto('./#/refuge/path');
  await expect.poll(() => firstSeen).toBe(true);
  await page.getByTestId('path-start').click();
  await step(page, 'down', 3);
  await step(page, 'right', 3);
  await page.getByTestId('path-next').click();
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'local');
  releasePrevious();
  await expect(page.getByTestId('path-rules-status')).toHaveAttribute('data-status', 'local');
  await expect(page.getByTestId('path-rules-status')).toContainText('Puoi continuare');
});
