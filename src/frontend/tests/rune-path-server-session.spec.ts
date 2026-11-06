import { expect, test, type Page, type Route } from '@playwright/test';

const id = '11111111-2222-4333-8444-555555555555';
const walls = [
  { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 2, y: 1 }, { x: 2, y: 2 },
];
const board = {
  puzzleIndex: 0, rulesVersion: 'rune-path-practice-v1',
  gridSize: 4, start: { x: 0, y: 0 }, goal: { x: 3, y: 3 }, walls,
};

function ticket(state: 'active' | 'completed' | 'expired' = 'active') {
  return {
    runId: id,
    activityKey: 'rune-path',
    rulesVersion: 'rune-path-practice-v1',
    puzzleIndex: 0,
    state,
    startedAtUtc: new Date(Date.now()).toISOString(),
    expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
    completedAtUtc: state === 'completed' ? new Date().toISOString() : null,
    stepsChecked: state === 'completed' ? 6 : null,
    replayed: false,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  // Existing session tests start with no owner-active ticket; route explicitly
  // so they cannot accidentally depend on a local development backend.
  await page.route('**/api/activities/runs/active/rune-path', route =>
    route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/activities/runs/history/rune-path*', route =>
    json(route, { items: [] }));
  await page.route('**/api/activities/runs/progress/rune-path', route =>
    json(route, {
      activityKey: 'rune-path', rulesVersion: 'rune-path-practice-v1',
      completedRuns: 0, boardsSolved: 0, totalBoards: 3,
      milestone: 'newcomer', boards: [],
      rewardsEnabled: false, xpGranted: 0, itemsGranted: 0,
      rewardBlockReason: 'automatable_practice',
    }));
  await page.addInitScript(() => {
    localStorage.clear();
    // addInitScript also runs on reload: keep a ticket to test recovery.
    if (!sessionStorage.getItem('vuxo.e2e.rune-initialized')) {
      sessionStorage.clear();
      sessionStorage.setItem('vuxo.e2e.rune-initialized', '1');
    }
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.accessToken', 'e2e-rune-session-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'rune-player', displayName: 'Rune Hero', email: null,
    }));
  });
});

async function openVerified(page: Page) {
  await page.goto('./#/refuge/path');
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-ready')).toBeVisible();
}

test('server-owned board survives refresh, sends only moves, and displays canonical completion', async ({ page }) => {
  let currentState: 'active' | 'completed' = 'active';
  const createKeys: string[] = [];
  const proofs: Array<{ key: string; body: Record<string, unknown>; authorization: string }> = [];
  const allRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/activities/')) allRequests.push(request.url());
  });

  await page.route('**/api/activities/runs/rune-path', route => {
    createKeys.push(route.request().headers()['idempotency-key']);
    expect(route.request().headers()['authorization']).toBe('Bearer e2e-rune-session-token');
    return json(route, ticket(), 201);
  });
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await page.route('**/api/activities/runs/' + id, route => json(route, ticket(currentState)));
  await page.route('**/api/activities/runs/' + id + '/complete', route => {
    const request = route.request();
    proofs.push({
      key: request.headers()['idempotency-key'],
      authorization: request.headers()['authorization'],
      body: request.postDataJSON() as Record<string, unknown>,
    });
    currentState = 'completed';
    return json(route, ticket('completed'));
  });

  await openVerified(page);
  // Recorded mode may perform one read-only active-ticket lookup; it must
  // not start a run or request gameplay rewards until the player clicks Start.
  expect(allRequests).toContainEqual(expect.stringContaining(
    '/api/activities/runs/active/rune-path'));
  expect(allRequests).toContainEqual(expect.stringContaining(
    '/api/activities/runs/history/rune-path'));
  expect(createKeys).toHaveLength(0);
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-board').locator('button')).toHaveCount(16);
  await expect(page.getByTestId('verified-path-cell-1-0')).toBeDisabled();
  await expect(page.getByTestId('verified-path-remaining')).toBeVisible();

  await page.getByTestId('verified-path-step-right').click(); // Wall.
  await expect(page.getByTestId('verified-path-bumps')).toContainText('1');
  await page.getByTestId('verified-path-step-down').click();
  await expect(page.getByTestId('verified-path-position')).toContainText('colonna 1, riga 2');
  await page.reload();
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');
  await expect(page.getByTestId('verified-path-position')).toContainText('colonna 1, riga 2');

  await page.getByTestId('verified-path-step-down').click();
  await page.getByTestId('verified-path-step-down').click();
  for (let n = 0; n < 3; n++) {
    await page.getByTestId('verified-path-step-right').click();
  }
  await expect(page.getByTestId('verified-path-submit')).toBeEnabled();
  await page.getByTestId('verified-path-submit').click();
  await expect(page.getByTestId('verified-path-completed')).toContainText('6 mosse');
  expect(createKeys).toHaveLength(1);
  expect(createKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(proofs).toHaveLength(1);
  expect(proofs[0].authorization).toBe('Bearer e2e-rune-session-token');
  expect(proofs[0].key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(proofs[0].body).toEqual({ moves: 'DDDRRR' });
  await page.reload();
  await page.getByTestId('path-mode-saved').click();
  await expect(page.getByTestId('verified-path-completed')).toBeVisible();
  expect(allRequests.some(url => url.endsWith('/api/activities/runs/' + id))).toBe(true);
  await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
});

test('English dark-mode mobile board, wall feedback, keyboard movement and expired ticket', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.route('**/api/activities/runs/rune-path', route => json(route, ticket(), 201));
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await openVerified(page);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByText('Server-owned Rune Path session')).toBeVisible();
  await expect(page.getByTestId('verified-path-disclaimer')).toContainText('No XP');
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-board')).toBeVisible();
  await page.getByTestId('verified-path-board').focus();
  await page.getByTestId('verified-path-board').press('ArrowRight'); // Wall.
  await expect(page.getByTestId('verified-path-bumps')).toContainText('1');
  await page.getByTestId('verified-path-board').press('ArrowDown');
  await expect(page.getByTestId('verified-path-position')).toContainText('column 1, row 2');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  // The server's expiry, not any local timer or score, prevents submission.
  await page.clock.install({ time: new Date(Date.now()) });
  await page.clock.fastForward('06:00');
  await expect(page.getByTestId('verified-path-expired')).toBeVisible();
  await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
  await page.getByTestId('verified-path-new').click();
  await expect(page.getByTestId('verified-path-ready')).toBeVisible();
});

test('a lost start/finish response retries with the same UUID, and account switch cannot reuse ticket', async ({ page }) => {
  const keys: string[] = [];
  const finishKeys: string[] = [];
  let startCount = 0;
  let finishCount = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    startCount++;
    keys.push(route.request().headers()['idempotency-key']);
    return startCount === 1
      ? json(route, { code: 'activity_run_unavailable' }, 503)
      : json(route, ticket(), 201);
  });
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await page.route('**/api/activities/runs/' + id + '/complete', route => {
    finishCount++;
    finishKeys.push(route.request().headers()['idempotency-key']);
    return finishCount === 1
      ? json(route, { code: 'activity_run_unavailable' }, 503)
      : json(route, ticket('completed'));
  });
  await openVerified(page);
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-error')).toBeVisible();
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-board')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);

  for (let n = 0; n < 3; n++) await page.getByTestId('verified-path-step-down').click();
  for (let n = 0; n < 3; n++) await page.getByTestId('verified-path-step-right').click();
  await page.getByTestId('verified-path-submit').click();
  await expect(page.getByTestId('verified-path-error')).toBeVisible();
  await page.getByTestId('verified-path-submit').click();
  await expect(page.getByTestId('verified-path-completed')).toBeVisible();
  expect(finishKeys).toHaveLength(2);
  expect(finishKeys[0]).toBe(finishKeys[1]);

  // Change identity in the same tab; the old player's run stays isolated in
  // sessionStorage and must not render for the other authenticated account.
  await page.evaluate(() => {
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'different-player', displayName: 'Other Hero', email: null,
    }));
    localStorage.setItem('vuxo.accessToken', 'other-player-token');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('verified-path-ready')).toBeVisible();
  await expect(page.getByTestId('verified-path-completed')).toHaveCount(0);
  const keysStored = await page.evaluate(() =>
    Object.keys(sessionStorage).filter(key => key.includes('rune-path.run')));
  expect(keysStored).toEqual(['vuxo.refuge.rune-path.run.rune-player']);
});

test('two independent browser contexts discover the same owner ticket and a completed ticket disappears', async ({
  page, browser,
}) => {
  let currentState: 'active' | 'completed' = 'active';
  let starts = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    starts++;
    return json(route, ticket(), 201);
  });
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await page.route('**/api/activities/runs/' + id, route =>
    json(route, ticket(currentState)));
  await openVerified(page);
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-game')).toBeVisible();

  // New browser context has no sessionStorage ticket, only a JWT belonging to
  // the same account. No user-entered ticket id or second POST is necessary.
  const other = await browser.newPage();
  try {
    await other.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('vuxo.language', 'it');
      localStorage.setItem('vuxo.accessToken', 'e2e-rune-session-token');
      localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
      localStorage.setItem('vuxo.auth.user', JSON.stringify({
        id: 'rune-player', displayName: 'Rune Hero', email: null,
      }));
    });
    const auth: string[] = [];
    await other.route('**/api/activities/runs/active/rune-path', route => {
      auth.push(route.request().headers()['authorization']);
      return currentState === 'active'
        ? json(route, ticket())
        : route.fulfill({ status: 204, body: '' });
    });
    await other.route('**/api/activities/rune-path/puzzles/0', route =>
      json(route, board));
    await other.route('**/api/activities/runs/' + id + '/complete', route => {
      expect(route.request().postDataJSON()).toEqual({ moves: 'DDDRRR' });
      currentState = 'completed';
      return json(route, ticket('completed'));
    });
    // Browser.newPage() creates an independent context without the fixture baseURL.
    await other.goto('http://127.0.0.1:4173/Vuxo/#/refuge/path');
    await other.getByTestId('path-mode-saved').click();
    await expect(other.getByTestId('verified-path-game')).toBeVisible();
    await expect(other.getByTestId('verified-path-moves')).toContainText('0');
    expect(auth).toEqual(['Bearer e2e-rune-session-token']);
    expect(starts).toBe(1);

    for (let n = 0; n < 3; n++) await other.getByTestId('verified-path-step-down').click();
    for (let n = 0; n < 3; n++) await other.getByTestId('verified-path-step-right').click();
    await other.getByTestId('verified-path-submit').click();
    await expect(other.getByTestId('verified-path-completed')).toBeVisible();

    // First device still knows its run id; JWT GET now reflects the completion.
    await page.reload();
    await page.getByTestId('path-mode-saved').click();
    await expect(page.getByTestId('verified-path-completed')).toBeVisible();
    expect(starts).toBe(1);
  } finally {
    await other.close();
  }
});

test('visible tab detects a remote server completion without reloading or creating another ticket', async ({ page }) => {
  let state: 'active' | 'completed' = 'active';
  let reads = 0;
  let starts = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    starts++;
    return json(route, ticket(), 201);
  });
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await page.route('**/api/activities/runs/' + id, route => {
    reads++;
    expect(route.request().headers()['authorization']).toBe('Bearer e2e-rune-session-token');
    return json(route, ticket(state));
  });
  await openVerified(page);
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-board')).toBeVisible();
  await page.getByTestId('verified-path-step-down').click();
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');

  // The second device has completed the same server-issued ticket. Returning
  // to this tab requests the authoritative GET without a page reload.
  state = 'completed';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('verified-path-remote-update'))
    .toContainText('completata su un altro dispositivo');
  await expect(page.getByTestId('verified-path-completed')).toBeVisible();
  await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
  expect(reads).toBeGreaterThanOrEqual(1);
  expect(starts).toBe(1);
  const saved = await page.evaluate(() =>
    sessionStorage.getItem('vuxo.refuge.rune-path.run.rune-player'));
  expect(JSON.parse(saved ?? 'null')).toEqual({ runId: id, moves: '' });
});

test('remote expiry is authoritative; a transient status outage preserves local moves', async ({ page }) => {
  let state: 'active' | 'expired' = 'active';
  let offline = true;
  let starts = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    starts++;
    return json(route, ticket(), 201);
  });
  await page.route('**/api/activities/rune-path/puzzles/0', route => json(route, board));
  await page.route('**/api/activities/runs/' + id, route => offline
    ? json(route, { code: 'activity_run_unavailable' }, 503)
    : json(route, ticket(state)));
  await openVerified(page);
  await page.getByTestId('verified-path-start').click();
  await expect(page.getByTestId('verified-path-board')).toBeVisible();
  await page.getByTestId('verified-path-step-down').click();
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('verified-path-sync-offline')).toBeVisible();
  await expect(page.getByTestId('verified-path-board')).toBeVisible();
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');

  // Reconnection does not replay a POST or discard the player's visual path.
  offline = false;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('verified-path-sync-offline')).toHaveCount(0);
  await expect(page.getByTestId('verified-path-moves')).toContainText('1');
  state = 'expired';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('verified-path-remote-update'))
    .toContainText('scaduta sul server');
  await expect(page.getByTestId('verified-path-board')).toHaveCount(0);
  await expect(page.getByTestId('verified-path-expired')).toBeVisible();
  expect(starts).toBe(1);
});

test('private recorded history renders verified results and refreshes without starting a run', async ({ page }) => {
  let calls = 0;
  const history = {
    items: [
      { ...ticket('completed'), stepsChecked: 6 },
      { ...ticket('expired'), runId: '00000000-0000-4000-8000-000000000022' },
    ],
  };
  await page.route('**/api/activities/runs/history/rune-path*', route => {
    calls++;
    expect(route.request().headers()['authorization']).toBe('Bearer e2e-rune-session-token');
    expect(route.request().method()).toBe('GET');
    return json(route, history);
  });
  let starts = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    starts++;
    return json(route, ticket(), 201);
  });
  await openVerified(page);
  await expect(page.getByTestId('path-history-item')).toHaveCount(2);
  await expect(page.getByTestId('path-history-item').first()).toContainText('6 mosse verificate');
  await expect(page.getByTestId('path-history-item').last()).toContainText('Sessione scaduta');
  await page.getByTestId('path-history-refresh').click();
  await expect.poll(() => calls).toBe(2);
  expect(starts).toBe(0);
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('path-history-panel')).toContainText('My sessions');
  await expect(page.getByTestId('path-history-item').first()).toContainText('verified moves');
  await page.setViewportSize({ width: 320, height: 760 });
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('history has no cross-account leakage and displays bounded errors/empty state', async ({ page }) => {
  await page.route('**/api/activities/runs/history/rune-path*', route => {
    const auth = route.request().headers()['authorization'];
    if (auth === 'Bearer e2e-rune-session-token')
      return json(route, { items: [{ ...ticket('completed'), stepsChecked: 6 }] });
    return json(route, { items: [] });
  });
  await openVerified(page);
  await expect(page.getByTestId('path-history-item')).toHaveCount(1);

  await page.evaluate(() => {
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'different-player', displayName: 'Another Hero', email: null,
    }));
    localStorage.setItem('vuxo.accessToken', 'second-owner-token');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('path-history-empty')).toBeVisible();
  await expect(page.getByTestId('path-history-item')).toHaveCount(0);

  await page.route('**/api/activities/runs/history/rune-path*', route =>
    json(route, { code: 'activity_run_unavailable' }, 503));
  await page.getByTestId('path-history-refresh').click();
  await expect(page.getByTestId('path-history-error')).toBeVisible();
});

test('server practice milestones show board bests, mobile IT/EN and zero reward entitlements', async ({ page }) => {
  let calls = 0;
  const body = {
    activityKey: 'rune-path', rulesVersion: 'rune-path-practice-v1',
    completedRuns: 5, boardsSolved: 2, totalBoards: 3,
    milestone: 'navigator',
    boards: [
      { puzzleIndex: 0, completedRuns: 4, bestSteps: 6 },
      { puzzleIndex: 2, completedRuns: 1, bestSteps: 7 },
    ],
    rewardsEnabled: false, xpGranted: 0, itemsGranted: 0,
    rewardBlockReason: 'automatable_practice',
  };
  await page.route('**/api/activities/runs/progress/rune-path', route => {
    calls++;
    expect(route.request().headers()['authorization'])
      .toBe('Bearer e2e-rune-session-token');
    expect(route.request().method()).toBe('GET');
    return json(route, body);
  });
  let starts = 0;
  await page.route('**/api/activities/runs/rune-path', route => {
    starts++;
    return json(route, ticket(), 201);
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await openVerified(page);
  await expect(page.getByTestId('path-progress-stage')).toContainText('Navigatore');
  await expect(page.getByTestId('path-progress-counts')).toContainText('2 su 3');
  await expect(page.getByTestId('path-progress-total')).toContainText('5');
  await expect(page.getByTestId('path-progress-board-0')).toContainText('6 mosse');
  await expect(page.getByTestId('path-progress-board-1')).toContainText('Da completare');
  await expect(page.getByTestId('path-progress-board-2')).toContainText('7 mosse');
  await expect(page.getByTestId('path-progress-reward-notice')).toContainText('nessun XP');
  await page.getByTestId('path-progress-refresh').click();
  await expect.poll(() => calls).toBe(2);
  expect(starts).toBe(0);
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('path-progress-panel')).toContainText('Practice progress');
  await expect(page.getByTestId('path-progress-stage')).toContainText('Rune Navigator');
  await expect(page.getByTestId('path-progress-reward-notice')).toContainText('no XP');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});

test('practice progress is owner-isolated and handles a read failure without client awards', async ({ page }) => {
  await page.route('**/api/activities/runs/progress/rune-path', route => {
    if (route.request().headers()['authorization'] === 'Bearer e2e-rune-session-token')
      return json(route, {
        activityKey: 'rune-path', rulesVersion: 'rune-path-practice-v1',
        completedRuns: 3, boardsSolved: 1, totalBoards: 3,
        milestone: 'explorer', boards: [{ puzzleIndex: 0, completedRuns: 3, bestSteps: 6 }],
        rewardsEnabled: false, xpGranted: 0, itemsGranted: 0,
        rewardBlockReason: 'automatable_practice',
      });
    return json(route, {
      activityKey: 'rune-path', rulesVersion: 'rune-path-practice-v1',
      completedRuns: 0, boardsSolved: 0, totalBoards: 3,
      milestone: 'newcomer', boards: [],
      rewardsEnabled: false, xpGranted: 0, itemsGranted: 0,
      rewardBlockReason: 'automatable_practice',
    });
  });
  await openVerified(page);
  await expect(page.getByTestId('path-progress-counts')).toContainText('1 su 3');
  await page.evaluate(() => {
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'another-player', displayName: 'Another Hero', email: null,
    }));
    localStorage.setItem('vuxo.accessToken', 'another-player-token');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('path-progress-counts')).toContainText('0 su 3');
  await expect(page.getByTestId('path-progress-stage')).toContainText('Primi passi');
  await page.route('**/api/activities/runs/progress/rune-path', route =>
    json(route, { code: 'activity_run_unavailable' }, 503));
  await page.getByTestId('path-progress-refresh').click();
  await expect(page.getByTestId('path-progress-error')).toBeVisible();
  await expect(page.getByTestId('path-progress-reward-notice')).toContainText('nessun XP');
  await expect(page.getByTestId('path-progress-content')).toHaveCount(0);
});
