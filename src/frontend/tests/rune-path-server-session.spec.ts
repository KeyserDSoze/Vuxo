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
  expect(allRequests).toHaveLength(1);
  expect(allRequests[0]).toContain('/api/activities/runs/active/rune-path');
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
    await other.goto('./#/refuge/path');
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
