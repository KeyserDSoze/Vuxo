import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
const grantId = '11111111-1111-4111-8111-111111111111';
const sequence = ['sun', 'moon', 'star', 'wave'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function initializePlayer(page: Page, language: 'it' | 'en' = 'it') {
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await page.addInitScript(({ language, expiry }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.e2ePlayerId', 'portal-player');
    localStorage.setItem('vuxo.e2eCharacterName', 'Portal Vuxian');
    localStorage.setItem('vuxo.accessToken', 'e2e-world-portal-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiry);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'portal-player', displayName: 'Portal Vuxian', email: null,
    }));
  }, { language, expiry });
}

async function mockPrivatePortals(
  page: Page, x = 4.5, y = 4.5,
  extraMarkers: Array<{ id: string; contentKey: string; x: number; y: number }> = [],
) {
  let consumed = false;
  let entryCalls = 0;
  let listCalls = 0;
  let attempts = 0;
  await page.route('**/api/personal-content**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    let status = 200;
    let body: unknown;
    if (pathname === '/api/personal-content/world-portals' && req.method() === 'GET') {
      listCalls++;
      body = consumed ? [] : [{ id: grantId, contentKey: 'portal.grove', x, y }, ...extraMarkers];
    } else if (pathname.endsWith('/world-portals/' + grantId + '/enter')) {
      entryCalls++;
      body = { id: grantId, contentKey: 'portal.grove', x, y };
    } else if (pathname === '/api/personal-content') {
      body = consumed ? [] : [{
        id: grantId, contentKey: 'portal.grove', portalKey: 'challenge.sequence.v1',
        expiresAtUtc: null,
      }];
    } else if (pathname.endsWith('/challenge') && req.method() === 'GET') {
      body = { grantId, version: 'portal-sequence-v1', sequence };
    } else if (pathname.endsWith('/challenge/attempt') && req.method() === 'POST') {
      attempts++;
      const answer = (req.postDataJSON() as { sequence: string[] }).sequence;
      if (JSON.stringify(answer) === JSON.stringify(sequence)) {
        consumed = true;
        body = { id: grantId };
      } else {
        status = 422;
        body = { code: 'portal_challenge_incorrect' };
      }
    } else {
      status = 404;
      body = { code: 'exclusive_content_not_found' };
    }
    await route.fulfill({ status, contentType: 'application/json', headers: cors,
      body: JSON.stringify(body) });
  });
  return { getEntryCalls: () => entryCalls, getAttempts: () => attempts, getListCalls: () => listCalls };
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(origin + '/__vuxo_e2e/world/reset');
  expect(response.ok()).toBeTruthy();
});

test('personal marker opens existing challenge in-world, then disappears on success', async ({ page }) => {
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portals')).toContainText('Portali personali');
  const enter = page.getByTestId('world-portal-enter');
  await expect(enter).toBeEnabled();
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();

  await enter.click();
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  await expect(page.getByTestId('portal-preview')).toBeVisible();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  for (const rune of sequence) {
    await page.getByTestId('portal-rune-' + rune).click();
  }
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-complete')).toContainText('Sfida completata');
  await expect(page.getByTestId('world-portals')).toHaveCount(0);
  expect(api.getEntryCalls()).toBe(1);
  expect(api.getAttempts()).toBe(1);

  await page.getByRole('button', { name: 'Torna ai portali' }).click();
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
});

test('clicking a visible Phaser portal marker opens the in-world dialog', async ({ page }) => {
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  const canvas = page.getByTestId('game-canvas').locator('canvas');
  await expect(canvas).toBeVisible();
  // Wait for Phaser to install the marker's interactive hit area, rather
  // than relying on a fixed timeout after the React portal list appears.
  const host = page.getByTestId('game-canvas');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  await expect(host).toHaveAttribute('data-portal-screen-x', /[0-9]/);
  await expect(host).toHaveAttribute('data-portal-screen-y', /[0-9]/);

  // Click the marker's actual projected screen position, not the canvas
  // center. Phaser's follow camera may still be interpolating in headless CI.
  const marker = await host.evaluate(element => ({
    x: Number(element.dataset.portalScreenX),
    y: Number(element.dataset.portalScreenY),
  }));
  expect(Number.isFinite(marker.x) && Number.isFinite(marker.y)).toBe(true);
  const dimensions = await canvas.evaluate(element => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const box = await canvas.boundingBox();
  if (!box) throw new Error('World canvas is not mounted');
  expect(marker.x).toBeGreaterThan(0);
  expect(marker.y).toBeGreaterThan(0);
  expect(marker.x).toBeLessThan(dimensions.width);
  expect(marker.y).toBeLessThan(dimensions.height);
  await canvas.click({
    position: {
      x: marker.x * box.width / dimensions.width,
      y: marker.y * box.height / dimensions.height,
    },
  });
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
});

test('portal dialog locks all touch intents and restores fresh movement on close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status'))
    .toHaveAttribute('data-status', 'connected');

  const player = page.locator('[data-player-id="portal-player"]');
  const right = page.getByTestId('touch-right');
  await expect(right).toBeEnabled();
  const initialX = Number(await player.getAttribute('data-player-x'));
  await right.dispatchEvent('pointerdown');
  await expect.poll(async () => Number(await player.getAttribute('data-player-x')))
    .toBeGreaterThan(initialX);
  await right.dispatchEvent('pointerup');
  await page.waitForTimeout(180);

  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  for (const direction of ['touch-up', 'touch-down', 'touch-left', 'touch-right']) {
    await expect(page.getByTestId(direction)).toBeDisabled();
  }

  const lockedX = Number(await player.getAttribute('data-player-x'));
  const lockedY = Number(await player.getAttribute('data-player-y'));
  await right.dispatchEvent('pointerdown');
  await page.waitForTimeout(300);
  expect(Number(await player.getAttribute('data-player-x'))).toBe(lockedX);
  expect(Number(await player.getAttribute('data-player-y'))).toBe(lockedY);
  expect(api.getEntryCalls()).toBe(1);

  await page.getByRole('dialog').press('Escape');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await expect(right).toBeEnabled();
  await right.dispatchEvent('pointerdown');
  await expect.poll(async () => Number(await player.getAttribute('data-player-x')))
    .toBeGreaterThan(lockedX);
  await right.dispatchEvent('pointerup');
  expect(api.getEntryCalls()).toBe(1);
});

test('far markers are not enterable through keyboard or touch control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page, 18.5, 18.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portals')).toContainText('Personal portals');
  await expect(page.getByTestId('world-portal-enter')).toBeDisabled();
  await expect(page.getByText('Move closer to a portal')).toBeVisible();
  await expect(page.getByTestId('touch-controls')).toBeVisible();
  expect(api.getEntryCalls()).toBe(0);
});

test('portal compass tracks only private marker bearing while moving, with localized labels', async ({ page }) => {
  await initializePlayer(page);
  const api = await mockPrivatePortals(page, 18.5, 4.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const compass = page.getByTestId('world-portal-compass');
  await expect(compass).toHaveAttribute('data-target-number', '1');
  await expect(compass).toHaveAttribute('data-direction', 'e');
  await expect(compass).toContainText('est');
  await expect(compass).toContainText('14 caselle');

  const start = Number(await compass.getAttribute('data-distance'));
  await page.getByTestId('game-canvas').locator('canvas').click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => Number(await compass.getAttribute('data-distance'))).toBeLessThan(start);
  await page.keyboard.up('ArrowRight');
  expect(api.getEntryCalls()).toBe(0);
  expect(api.getListCalls()).toBe(1);

  await page.getByTestId('language-toggle').click();
  await expect(compass).toContainText('east');
  await expect(compass).toHaveAttribute('aria-label', /Portal 1 compass: east/);
  expect(api.getListCalls()).toBe(1);
});

test('portal compass selects the closest authorized marker rather than the first', async ({ page }) => {
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page, 18.5, 4.5, [{
    id: '22222222-2222-4222-8222-222222222222', contentKey: 'portal.moon',
    x: 4.5, y: 8.5,
  }]);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const compass = page.getByTestId('world-portal-compass');
  await expect(compass).toHaveAttribute('data-target-number', '2');
  await expect(compass).toHaveAttribute('data-direction', 's');
  await expect(compass).toContainText('south');
  await expect(compass).toContainText('4 tiles');
  expect(api.getEntryCalls()).toBe(0);
});

test('invalid private marker coordinates cannot create a misleading compass', async ({ page }) => {
  await initializePlayer(page);
  await mockPrivatePortals(page, Number.NaN, Number.NaN);
  // JSON.stringify serializes NaN as null; these are not finite world coordinates.
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portal-enter')).toHaveCount(1);
  await expect(page.getByTestId('world-portal-compass')).toHaveCount(0);
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(0);
});

test('world radar shows only granted portal, clamps distant marker and updates after server movement', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page, 18.5, 4.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');

  const radar = page.getByTestId('world-radar');
  const marker = page.getByTestId('world-radar-portal');
  await expect(radar).toBeVisible();
  await expect(radar).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByTestId('world-radar-self')).toHaveAttribute('cx', '72');
  await expect(page.getByTestId('world-radar-self')).toHaveAttribute('cy', '72');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('data-at-edge', 'true');
  await expect(marker).toHaveAttribute('data-number', '1');
  await expect(page.getByTestId('world-radar-chart')).toHaveAttribute('aria-label', /personal portals/);
  expect(Number(await marker.getAttribute('x'))).toBeGreaterThan(110);
  const initialDistance = Number(await marker.getAttribute('data-distance'));

  await page.getByTestId('game-canvas').locator('canvas').click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => Number(await marker.getAttribute('data-distance'))).toBeLessThan(initialDistance);
  await page.keyboard.up('ArrowRight');
  expect(api.getEntryCalls()).toBe(0);
  expect(api.getListCalls()).toBe(1);
});

test('mobile radar can open and close without scrolling the document; labels follow language', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page);
  const api = await mockPrivatePortals(page, 18.5, 4.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const radar = page.getByTestId('world-radar');
  const toggle = page.getByTestId('world-radar-toggle');
  await expect(radar).toHaveAttribute('data-expanded', 'false');
  await expect(page.getByTestId('world-radar-chart')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-label', 'Apri radar');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('world-radar-chart')).toBeInViewport();
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1 &&
    document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await page.getByTestId('language-toggle').click();
  await expect(toggle).toHaveAttribute('aria-label', 'Close radar');
  await toggle.click();
  await expect(page.getByTestId('world-radar-chart')).toHaveCount(0);
  expect(api.getListCalls()).toBe(1);
});

test('world markers remain private and are not rendered without a Vuxo session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.e2ePlayerId', 'unauth-player');
  });
  let requests = 0;
  await page.route('**/api/personal-content/world-portals', route => {
    requests++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portals')).toHaveCount(0);
  await expect(page.getByTestId('world-portal-compass')).toHaveCount(0);
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(0);
  expect(requests).toBe(0);
});


test('world Guardian duel resolves two revealed cards server-side and preserves state on re-entry', async ({ page }) => {
  await initializePlayer(page);
  await mockPrivatePortals(page);
  let turn = 0;
  let guardianHealth = 6;
  let playerHealth = 20;
  const keys: string[] = [];
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const req = route.request();
    if (req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/history')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify(Array.from({ length: turn }, (_, index) => ({
          turn: index + 1, action: 'strike', guardianAction: 'guard',
          damageDealt: 1, damageTaken: 0,
          guardianHealth: 5 - index, playerHealth: 20,
          outcome: 'ongoing', occurredAtUtc: new Date().toISOString(),
        }))),
      });
    }
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({
          grantId, turn, guardianHealth, guardianMaxHealth: 6,
          playerHealth, playerMaxHealth: 20,
          outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v1',
        }) });
    }
    const data = req.postDataJSON() as {
      action: string; expectedTurn: number; damage?: number;
    };
    expect(req.method()).toBe('POST');
    expect(data).toEqual({ action: 'strike', expectedTurn: turn });
    expect(req.headers()['authorization']).toBe('Bearer e2e-world-portal-token');
    const key = req.headers()['idempotency-key'];
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    keys.push(key);
    turn++;
    guardianHealth--;
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, idempotencyKey: key, turn, action: 'strike',
        guardianAction: 'guard', damageDealt: 1, damageTaken: 0,
        guardianHealth, guardianMaxHealth: 6, playerHealth, playerMaxHealth: 20,
        outcome: 'ongoing', replayed: false,
      }) });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-duel')).toBeVisible();
  await expect(page.getByTestId('guardian-feint')).toHaveCount(0); // legacy v1 encounter
  await expect(page.getByTestId('guardian-health')).toContainText('6 / 6 HP');
  await page.getByTestId('guardian-strike').click();
  await expect(page.getByTestId('guardian-turn-result')).toContainText('Danni inflitti: 1 HP');
  await expect(page.getByTestId('guardian-health')).toContainText('5 / 6 HP');
  await expect(page.getByTestId('guardian-history-entry')).toHaveCount(1);
  expect(keys).toHaveLength(1);
  // Closing the dialog never resets server-owned turn/HP state.
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-turn')).toContainText('Turno 1 / 12');
  await expect(page.getByTestId('guardian-health')).toContainText('5 / 6 HP');
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Turno 1');
});


test('v2 Guardian unlocks tactical Feint only from server status, updates HP and works on mobile IT/EN', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page);
  let turn = 0;
  const sent: Array<{ action: string; expectedTurn: number; extra?: number }> = [];
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith('/history')) {
      return route.fulfill({
        status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify(turn ? [{
          turn, action: 'feint', guardianAction: 'guard', damageDealt: 3,
          damageTaken: 0, guardianHealth: 3, playerHealth: 20, outcome: 'ongoing',
          occurredAtUtc: new Date().toISOString(),
        }] : []),
      });
    }
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({
          grantId, turn, guardianHealth: 6 - 3 * turn, guardianMaxHealth: 6,
          playerHealth: 20, playerMaxHealth: 20,
          outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v2',
        }),
      });
    }
    const body = req.postDataJSON() as { action: string; expectedTurn: number; extra?: number };
    sent.push(body);
    expect(req.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
    turn++;
    return route.fulfill({
      status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, idempotencyKey: req.headers()['idempotency-key'], turn,
        action: 'feint', guardianAction: 'guard',
        damageDealt: 3, damageTaken: 0, guardianHealth: 3,
        guardianMaxHealth: 6, playerHealth: 20, playerMaxHealth: 20,
        outcome: 'ongoing', replayed: false,
      }),
    });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  const feint = page.getByTestId('guardian-feint');
  await expect(feint).toBeVisible();
  await expect(feint).toContainText('Feint');
  await expect(page.getByTestId('guardian-feint-help')).toContainText('breaks through Guard');
  await feint.click();
  await expect(page.getByTestId('guardian-turn-result')).toContainText('Damage dealt: 3 HP');
  await expect(page.getByTestId('guardian-health')).toContainText('3 / 6 HP');
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Feint');
  expect(sent).toEqual([{ action: 'feint', expectedTurn: 0 }]); // no client-provided HP/damage
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-feint')).toContainText('Finta');
  await expect(page.getByTestId('guardian-feint-help')).toContainText('Destrezza');
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Finta');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('Guardian mobile English safely retries an ambiguous turn with the same UUID', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page);
  const keys: string[] = [];
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const req = route.request();
    if (req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/history')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
    }
    if (req.method() === 'GET') return route.fulfill({
      status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, turn: 0, guardianHealth: 6, guardianMaxHealth: 6,
        playerHealth: 20, playerMaxHealth: 20,
        outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v1'
      }),
    });
    keys.push(req.headers()['idempotency-key']);
    if (keys.length === 1) return route.fulfill({
      status: 503, headers: cors, contentType: 'application/json',
      body: JSON.stringify({ code: 'guardian_request_failed' }),
    });
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, idempotencyKey: keys[1], turn: 1,
        action: 'strike', guardianAction: 'guard',
        damageDealt: 1, damageTaken: 0,
        guardianHealth: 5, guardianMaxHealth: 6, playerHealth: 20,
        playerMaxHealth: 20, outcome: 'ongoing', replayed: true,
      }) });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-duel')).toContainText('Guardian showdown');
  await page.getByTestId('guardian-strike').click();
  await expect(page.getByTestId('guardian-error')).toContainText('Cannot confirm the battle');
  await expect(page.getByTestId('guardian-guard')).toBeDisabled();
  await page.getByTestId('guardian-retry').click();
  await expect(page.getByTestId('guardian-turn-result')).toContainText('Damage dealt: 1 HP');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('Guardian battle is unavailable without a verified world portal entry', async ({ page }) => {
  await initializePlayer(page);
  await mockPrivatePortals(page);
  let actions = 0;
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    if (route.request().method() === 'POST') actions++;
    return route.fulfill({
      status: 404, headers: cors, contentType: 'application/json',
      body: JSON.stringify({ code: 'guardian_unavailable' }),
    });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('portal-challenge')).toBeVisible();
  await expect(page.getByTestId('guardian-duel')).toHaveCount(0);
  expect(actions).toBe(0);
});


test('Guardian stale-turn rejection blocks further cards until server status refresh', async ({ page }) => {
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page);

  let serverTurn = 0;
  const sent: Array<{ action: string; expectedTurn: number; key: string }> = [];
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const request = route.request();
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/history')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
    }
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({
          grantId, turn: serverTurn, guardianHealth: 6 - serverTurn,
          guardianMaxHealth: 6, playerHealth: 20, playerMaxHealth: 20,
          outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v1',
        }),
      });
    }

    const body = request.postDataJSON() as { action: string; expectedTurn: number };
    sent.push({
      ...body, key: request.headers()['idempotency-key'],
    });
    if (sent.length === 1) {
      // Simulate another session completing the expected turn first.
      serverTurn = 1;
      return route.fulfill({
        status: 409, headers: cors, contentType: 'application/json',
        body: JSON.stringify({ code: 'guardian_stale_turn' }),
      });
    }
    serverTurn = 2;
    return route.fulfill({
      status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, idempotencyKey: sent[1].key, turn: serverTurn,
        action: 'guard', guardianAction: 'strike', damageDealt: 0,
        damageTaken: 0, guardianHealth: 4, guardianMaxHealth: 6,
        playerHealth: 20, playerMaxHealth: 20,
        outcome: 'ongoing', replayed: false,
      }),
    });
  });

  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-turn')).toContainText('Turn 0 / 12');
  await page.getByTestId('guardian-strike').click();
  await expect(page.getByTestId('guardian-error')).toContainText('turn has already changed');
  await expect(page.getByTestId('guardian-strike')).toBeDisabled();
  await expect(page.getByTestId('guardian-guard')).toBeDisabled();
  expect(sent).toHaveLength(1);

  await page.getByTestId('guardian-refresh').click();
  await expect(page.getByTestId('guardian-turn')).toContainText('Turn 1 / 12');
  await expect(page.getByTestId('guardian-error')).toHaveCount(0);
  await expect(page.getByTestId('guardian-guard')).toBeEnabled();
  await page.getByTestId('guardian-guard').click();
  await expect(page.getByTestId('guardian-turn')).toContainText('Turn 2 / 12');
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({ action: 'strike', expectedTurn: 0 });
  expect(sent[1]).toMatchObject({ action: 'guard', expectedTurn: 1 });
  expect(sent[1].key).not.toBe(sent[0].key);
});


test('Guardian log survives dialog reopening on mobile and switches language', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page);
  let turn = 0;
  const history = [] as Array<{
    turn: number; action: string; guardianAction: string; damageDealt: number;
    damageTaken: number; guardianHealth: number; playerHealth: number;
    outcome: string; occurredAtUtc: string;
  }>;
  const requests: string[] = [];
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(path);
    if (path.endsWith('/history')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify(history) });
    }
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({
          grantId, turn, guardianHealth: 6 - turn, guardianMaxHealth: 6,
          playerHealth: 20, playerMaxHealth: 20,
          outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v1',
        }) });
    }
    const action = (request.postDataJSON() as { action: string }).action;
    turn++;
    history.push({
      turn, action, guardianAction: 'guard', damageDealt: 1, damageTaken: 0,
      guardianHealth: 6 - turn, playerHealth: 20,
      outcome: 'ongoing', occurredAtUtc: new Date().toISOString(),
    });
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, idempotencyKey: request.headers()['idempotency-key'], turn, action,
        guardianAction: 'guard', damageDealt: 1, damageTaken: 0,
        guardianHealth: 6 - turn, guardianMaxHealth: 6, playerHealth: 20,
        playerMaxHealth: 20, outcome: 'ongoing', replayed: false,
      }) });
  });

  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-history-empty')).toContainText('No moves recorded');
  await page.getByTestId('guardian-strike').click();
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Turn 1');
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Turn 1');
  expect(requests.filter(url => url.endsWith('/history')).length).toBeGreaterThanOrEqual(2);
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-history-entry')).toContainText('Turno 1');
  await expect(page.getByTestId('guardian-history')).toContainText('Registro del duello');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('Guardian history failure is recoverable without replaying combat actions', async ({ page }) => {
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page);
  let historyRequests = 0;
  let turnRequests = 0;
  await page.route('**/api/characters/me/portal-guardian/**', route => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/history')) {
      historyRequests++;
      return route.fulfill({
        status: historyRequests === 1 ? 503 : 200,
        headers: cors, contentType: 'application/json',
        body: historyRequests === 1 ? JSON.stringify({ code: 'temporarily_unavailable' }) : '[]',
      });
    }
    if (request.method() === 'POST') turnRequests++;
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
      body: JSON.stringify({
        grantId, turn: 0, guardianHealth: 6, guardianMaxHealth: 6,
        playerHealth: 20, playerMaxHealth: 20,
        outcome: 'ongoing', ruleVersion: 'portal-guardian-showdown-v1',
      }),
    });
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('guardian-history-error')).toContainText('Could not load');
  await page.getByTestId('guardian-history-retry').click();
  await expect(page.getByTestId('guardian-history-empty')).toContainText('No moves recorded');
  await expect(page.getByTestId('guardian-history-error')).toHaveCount(0);
  expect(historyRequests).toBe(2);
  expect(turnRequests).toBe(0);
});

test('responsive camera keeps a real Phaser portal hit area clickable after ultrawide resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');
  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  await page.setViewportSize({ width: 3440, height: 1440 });
  await expect.poll(async () => Number(await host.getAttribute('data-e2e-camera-zoom')))
    .toBeGreaterThanOrEqual(1.75);

  // The portal and owner spawn at the same authoritative world tile. The
  // viewport transition must recenter immediately; otherwise a marker's
  // screen coordinates drift while Playwright prepares a click.
  await expect.poll(() => host.evaluate(element => {
    const canvas = element.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return Number.POSITIVE_INFINITY;
    const x = Number(element.dataset.portalScreenX);
    const y = Number(element.dataset.portalScreenY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Number.POSITIVE_INFINITY;
    return Math.hypot(x - canvas.width / 2, y - canvas.height / 2);
  })).toBeLessThan(14);

  // Take the projected marker and canvas bounds in one browser evaluation,
  // not 3 round trips separated by multiple 1440p frames on slow CI GPUs.
  const marker = await host.evaluate(element => {
    const canvas = element.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('World canvas not mounted');
    const box = canvas.getBoundingClientRect();
    return {
      x: Number(element.dataset.portalScreenX) * box.width / canvas.width,
      y: Number(element.dataset.portalScreenY) * box.height / canvas.height,
    };
  });
  await canvas.click({ position: marker });
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
});
