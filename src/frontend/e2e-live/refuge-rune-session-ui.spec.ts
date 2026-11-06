import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:8080';
type Cell = { x: number; y: number };
type Board = {
  gridSize: number;
  start: Cell;
  goal: Cell;
  puzzleIndex: number;
  rulesVersion: string;
  walls: Cell[];
};

async function login(request: APIRequestContext, subject: string): Promise<string> {
  const reply = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: 'Rune Path Live', role: 'User' },
  });
  expect(reply.status()).toBe(200);
  return ((await reply.json()) as { accessToken: string }).accessToken;
}

async function createCharacter(request: APIRequestContext, token: string) {
  const result = await request.post(api + '/api/characters', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      name: 'Rune Path Live',
      strength: 2, dexterity: 2, intelligence: 2, constitution: 2,
      luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1',
        bodyType: 'body-1', skinTone: 'skin-1', topColor: 'blue',
        bottomStyle: 'shorts', bottomColor: 'black',
        shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(result.status()).toBe(201);
}

function solve(board: Board): string {
  const visited = new Set([board.start.x + ':' + board.start.y]);
  const blocked = new Set(board.walls.map(cell => cell.x + ':' + cell.y));
  const queue = [{ ...board.start, moves: '' }];
  const directions = [
    { dx: 0, dy: 1, move: 'D' }, { dx: 1, dy: 0, move: 'R' },
    { dx: 0, dy: -1, move: 'U' }, { dx: -1, dy: 0, move: 'L' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === board.goal.x && current.y === board.goal.y)
      return current.moves;
    for (const direction of directions) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      const key = x + ':' + y;
      if (x < 0 || y < 0 || x >= board.gridSize || y >= board.gridSize ||
        visited.has(key) || blocked.has(key)) continue;
      visited.add(key);
      queue.push({ x, y, moves: current.moves + direction.move });
    }
  }
  throw new Error('No legal path in the server-selected board');
}

async function pressMove(page: Page, letter: string) {
  const labels: Record<string, string> = {
    D: 'down', R: 'right', U: 'up', L: 'left',
  };
  await page.getByTestId('verified-path-step-' + labels[letter]).click();
}

test('React Refuge finishes a real persisted Rune Path with PostgreSQL after refresh', async ({
  page, request,
}) => {
  const owner = 'live-rune-ui-' + randomUUID();
  const token = await login(request, owner);
  await createCharacter(request, token);

  await page.setViewportSize({ width: 320, height: 780 });
  await page.addInitScript(({ token, owner }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'en');
    localStorage.setItem('vuxo.theme', 'dark');
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc',
      new Date(Date.now() + 60 * 60 * 1000).toISOString());
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: owner, displayName: 'Rune Path Live', email: null,
    }));
  }, { token, owner });

  await page.goto('./#/refuge/path');
  await expect(page.getByTestId('path-ready')).toBeVisible();
  await expect(page.getByTestId('path-mode-saved')).toBeVisible();
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-ready')).toBeVisible();

  const startResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/activities/runs/rune-path')
    && response.request().method() === 'POST');
  await page.getByTestId('verified-path-start').click();
  const created = await startResponse;
  expect(created.status()).toBe(201);
  const ticket = await created.json() as {
    runId: string; puzzleIndex: number; rulesVersion: string;
    expiresAtUtc: string; state: string;
  };
  expect(ticket.state).toBe('active');
  expect(ticket.rulesVersion).toBe('rune-path-practice-v1');

  const boardResponse = await request.get(
    api + '/api/activities/rune-path/puzzles/' + ticket.puzzleIndex);
  expect(boardResponse.status()).toBe(200);
  const board = await boardResponse.json() as Board;
  const solution = solve(board);
  await expect(page.getByTestId('verified-path-board').locator('button')).toHaveCount(16);
  await expect(page.getByTestId('verified-path-puzzle'))
    .toContainText('Server-assigned board');

  // The React board must render the same walls as the API, not a local guess.
  for (let y = 0; y < board.gridSize; y++) {
    for (let x = 0; x < board.gridSize; x++) {
      const blocked = board.walls.some(wall => wall.x === x && wall.y === y);
      await expect(page.getByTestId('verified-path-cell-' + x + '-' + y))
        .toHaveAttribute('data-wall', String(blocked));
    }
  }
  await pressMove(page, solution[0]);
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');

  // Refresh the actual SPA and recover both ticket and legal visual steps.
  await page.reload();
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');
  for (const move of solution.slice(1)) await pressMove(page, move);
  await expect(page.getByTestId('verified-path-submit')).toBeEnabled();

  const finishResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/activities/runs/' + ticket.runId + '/complete')
    && response.request().method() === 'POST');
  await page.getByTestId('verified-path-submit').click();
  const completed = await finishResponse;
  expect(completed.status()).toBe(200);
  expect(completed.request().postDataJSON()).toEqual({ moves: solution });
  const receipt = await completed.json() as {
    state: string; stepsChecked: number; runId: string;
  };
  expect(receipt.runId).toBe(ticket.runId);
  expect(receipt.state).toBe('completed');
  expect(receipt.stepsChecked).toBe(solution.length);
  await expect(page.getByTestId('verified-path-completed'))
    .toContainText('No rewards granted');

  const stored = await request.get(
    api + '/api/activities/runs/' + ticket.runId,
    { headers: { Authorization: 'Bearer ' + token } });
  expect(stored.status()).toBe(200);
  expect((await stored.json() as { state: string }).state).toBe('completed');

  // The real PostgreSQL history is owner-only and reflects the same receipt.
  const history = await request.get(
    api + '/api/activities/runs/history/rune-path?limit=5',
    { headers: { Authorization: 'Bearer ' + token } });
  expect(history.status()).toBe(200);
  const archive = await history.json() as {
    items: Array<{ runId: string; state: string; stepsChecked: number | null }>
  };
  const entry = archive.items.find(item => item.runId === ticket.runId);
  expect(entry).toMatchObject({
    state: 'completed', stepsChecked: solution.length,
  });
  const historyText = JSON.stringify(archive);
  for (const secret of ['proofHash', 'playerId', 'startKey', 'finishKey'])
    expect(historyText).not.toContain(secret);
  await expect(page.getByTestId('path-history-item').first())
    .toContainText('verified moves');

  // Client-side reload is never a new server-issued run or reward grant.
  await page.reload();
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-completed')).toBeVisible();
  await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter(key => /reward|rune-path.run/i.test(key))))
    .toEqual([]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    .toBe(true);
});

test('second device discovers and completes an owner-only PostgreSQL ticket', async ({
  page, browser, request,
}) => {
  const owner = 'live-rune-cross-device-' + randomUUID();
  const token = await login(request, owner);
  await createCharacter(request, token);
  await page.addInitScript(({ token, owner }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'en');
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc',
      new Date(Date.now() + 60 * 60 * 1000).toISOString());
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: owner, displayName: 'Rune Path Live', email: null,
    }));
  }, { token, owner });

  await page.goto('./#/refuge/path');
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-ready')).toBeVisible();
  const creating = page.waitForResponse(reply =>
    reply.url().endsWith('/api/activities/runs/rune-path') &&
    reply.request().method() === 'POST');
  await page.getByTestId('verified-path-start').click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const ticket = await created.json() as { runId: string; puzzleIndex: number };
  await expect(page.getByTestId('verified-path-game')).toBeVisible();

  const foreignToken = await login(request, 'live-rune-foreign-' + randomUUID());
  const foreign = await request.get(api + '/api/activities/runs/active/rune-path', {
    headers: { Authorization: 'Bearer ' + foreignToken },
  });
  expect(foreign.status()).toBe(204);
  const active = await request.get(api + '/api/activities/runs/active/rune-path', {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect(active.status()).toBe(200);
  expect((await active.json() as { runId: string }).runId).toBe(ticket.runId);

  const second = await browser.newPage();
  try {
    await second.addInitScript(({ token, owner }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('vuxo.language', 'en');
      localStorage.setItem('vuxo.accessToken', token);
      localStorage.setItem('vuxo.auth.expiresAtUtc',
        new Date(Date.now() + 60 * 60 * 1000).toISOString());
      localStorage.setItem('vuxo.auth.user', JSON.stringify({
        id: owner, displayName: 'Rune Path Live', email: null,
      }));
    }, { token, owner });
    await second.goto('http://127.0.0.1:4173/Vuxo/#/refuge/path');
    await second.getByTestId('path-mode-saved').click();
    await expect(second.getByTestId('verified-path-game')).toBeVisible();
    await expect(second.getByTestId('verified-path-moves')).toContainText('0');
    const boardReply = await request.get(
      api + '/api/activities/rune-path/puzzles/' + ticket.puzzleIndex);
    expect(boardReply.status()).toBe(200);
    const route = solve(await boardReply.json() as Board);
    for (const move of route) await pressMove(second, move);
    await expect(second.getByTestId('verified-path-submit')).toBeEnabled();
    await second.getByTestId('verified-path-submit').click();
    await expect(second.getByTestId('verified-path-completed')).toBeVisible();

    // Completed runs are no longer discoverable by other tabs or devices.
    const after = await request.get(api + '/api/activities/runs/active/rune-path', {
      headers: { Authorization: 'Bearer ' + token },
    });
    expect(after.status()).toBe(204);
    await page.bringToFront();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('verified-path-remote-update'))
      .toContainText('completed on another device');
    await expect(page.getByTestId('verified-path-completed')).toBeVisible();
    await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
    // The receiving browser refreshes its history when remote status updates.
    await expect(page.getByTestId('path-history-item').first())
      .toContainText('verified moves');
  } finally {
    await second.close();
  }
});

test('guest can play local Rune Path without any run ticket API traffic', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
  });
  const calls: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/api/activities/runs'))
      calls.push(request.url());
  });
  await page.goto('./#/refuge/path');
  await expect(page.getByTestId('path-mode-saved')).toHaveCount(0);
  await page.getByTestId('path-start').click();
  await page.getByTestId('path-step-down').click();
  await expect(page.getByTestId('path-position')).toContainText('colonna 1, riga 2');
  expect(calls).toEqual([]);
});
