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
  let currentX = x;
  let currentY = y;
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
      body = consumed ? extraMarkers : [{ id: grantId, contentKey: 'portal.grove', x: currentX, y: currentY }, ...extraMarkers];
    } else if (pathname.endsWith('/world-portals/' + grantId + '/enter')) {
      entryCalls++;
      body = { id: grantId, contentKey: 'portal.grove', x: currentX, y: currentY };
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
  return {
    getEntryCalls: () => entryCalls,
    getAttempts: () => attempts,
    getListCalls: () => listCalls,
    relocate: (nextX: number, nextY: number) => { currentX = nextX; currentY = nextY; },
  };
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(origin + '/__vuxo_e2e/world/reset');
  expect(response.ok()).toBeTruthy();
});


for (const [width, height] of [[390, 844], [1280, 720]] as const) {
  test('E enters only the nearby personal portal from world focus at ' + width + 'x' + height,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await initializePlayer(page, 'en');
      const api = await mockPrivatePortals(page);
      await page.goto(origin + '/Vuxo/#/game');
      await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
      const action = page.getByTestId('world-portal-enter');
      await expect(action).toBeEnabled();
      await expect(action).toHaveAttribute('aria-keyshortcuts', 'E');
      await expect(action).toHaveAttribute('title', 'Press E to enter the nearby portal');
      const prompt = page.getByTestId('world-portal-interact-prompt');
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText('Interact');
      await expect(prompt.locator('kbd')).toHaveText('E');
      const world = page.getByTestId('game-canvas');
      const dialog = page.getByTestId('world-portal-dialog');

      // Interactive focus must keep E for its native target.
      const help = page.getByTestId('game-controls-help');
      await help.click();
      await expect(page.getByTestId('world-controls-dialog')).toBeVisible();
      await expect(prompt).toHaveCount(0);
      await expect(page.getByTestId('world-controls-portals').locator('kbd')).toHaveText(['E', '✦']);
      await page.keyboard.press('e');
      expect(api.getEntryCalls()).toBe(0);
      await page.keyboard.press('Escape');
      await expect(help).toBeFocused();
      await expect(prompt).toBeVisible();
      await page.keyboard.press('e');
      expect(api.getEntryCalls()).toBe(0);
      await action.focus();
      await page.keyboard.press('e');
      expect(api.getEntryCalls()).toBe(0);
      await page.getByTestId('game-refuge-link').focus();
      await page.keyboard.press('e');
      expect(api.getEntryCalls()).toBe(0);
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'portal-E-shortcut-editor';
        input.setAttribute('aria-label', 'Portal E shortcut editor');
        document.body.appendChild(input);
        input.focus();
      });
      await page.keyboard.press('e');
      await expect(page.locator('#portal-E-shortcut-editor')).toHaveValue('e');
      expect(api.getEntryCalls()).toBe(0);
      await page.locator('#portal-E-shortcut-editor').evaluate(input => input.remove());

      // The nearby Phaser marker is centered on the canvas. A canvas click
      // can legitimately enter it, so focus the keyboard region directly.
      // Marker-click behavior remains tested separately below.
      await world.focus();
      await expect(world).toBeFocused();
      await page.keyboard.press('Shift+e');
      const ignored = await world.evaluate(element => [
        { ctrlKey: true }, { altKey: true }, { metaKey: true },
        { repeat: true }, { isComposing: true },
      ].map(flags => {
        const event = new KeyboardEvent('keydown', {
          key: 'e', code: 'KeyE', bubbles: true, cancelable: true, ...flags,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }));
      expect(ignored).toEqual([false, false, false, false, false]);
      await world.evaluate(element => {
        const event = new KeyboardEvent('keydown', {
          code: 'KeyE', key: 'e', bubbles: true, cancelable: true,
        });
        event.preventDefault();
        element.dispatchEvent(event);
      });
      expect(api.getEntryCalls()).toBe(0);
      await expect(dialog).toHaveCount(0);

      // Real keydown uses the same single-flight owner-grant API as HUD click.
      await page.keyboard.press('e');
      await expect(dialog).toBeVisible();
      await expect(prompt).toHaveCount(0);
      expect(api.getEntryCalls()).toBe(1);
      await page.keyboard.press('e');
      expect(api.getEntryCalls()).toBe(1);
      await info.attach('world-nearby-portal-E-' + width, {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      });
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.scrollingElement!.scrollTop === 0,
      )).toBe(true);
    });
}

test('E from the world never enters a distant owner-granted portal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'it');
  const api = await mockPrivatePortals(page, 54.5, 58.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const action = page.getByTestId('world-portal-enter');
  await expect(action).toBeDisabled();
  await expect(action).not.toHaveAttribute('aria-keyshortcuts', 'E');
  await expect(page.getByTestId('world-portal-interact-prompt')).toHaveCount(0);
  await page.getByTestId('game-canvas').focus();
  await page.keyboard.press('e');
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  expect(api.getEntryCalls()).toBe(0);
});

test('contextual E compass prompt fits the smallest world and switches IT/EN', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await initializePlayer(page, 'it');
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const prompt = page.getByTestId('world-portal-interact-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Interagisci');
  await expect(prompt).toHaveAttribute('aria-label', 'Premi E o tocca il portale a portata per entrare');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1 &&
    document.scrollingElement!.scrollTop === 0,
  )).toBe(true);
  await info.attach('world-interact-E-prompt-320', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  await page.getByTestId('language-toggle').click();
  await expect(prompt).toContainText('Interact');
  await expect(prompt).toHaveAttribute('aria-label', 'Press E or tap the in-range portal to enter');
  expect(api.getEntryCalls()).toBe(0);
});

test('rapid E presses remain single-flight while the authoritative entry is pending', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let intercepted = 0;
  await page.route('**/api/personal-content/world-portals/' + grantId + '/enter', async route => {
    intercepted++;
    await gate;
    await route.fallback();
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-portal-enter')).toBeEnabled();
  await page.getByTestId('game-canvas').focus();
  try {
    await page.keyboard.press('e');
    await expect.poll(() => intercepted).toBe(1);
    await expect(page.getByTestId('world-portal-action-list')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('touch-right')).toBeDisabled();
    await page.keyboard.press('e');
    await page.waitForTimeout(120);
    expect(intercepted).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
});

test('slow portal entry is single-flight across HUD and Phaser, and freezes movement until response', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve });
  let intercepted = 0;
  // This last-registered handler delays the request then delegates to the
  // existing authoritative owner-only mock. It never simulates entry success.
  await page.route('**/api/personal-content/world-portals/' + grantId + '/enter', async route => {
    intercepted++;
    await gate;
    await route.fallback();
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const button = page.getByTestId('world-portal-enter');
  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(button).toBeEnabled();
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  try {
    await button.click();
    await expect.poll(() => intercepted).toBe(1);
    await expect(button).toBeDisabled();
    await expect(page.getByTestId('world-portal-action-list')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('world-portal-entering')).toHaveText('Entering portal…');
    await expect(page.getByTestId('touch-right')).toBeDisabled();
    await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
    // Click the actual Phaser marker while the HUD POST is awaiting the
    // server: a separate scene event must not dispatch a second POST.
    const marker = await host.evaluate(element => ({
      x: Number(element.dataset.portalScreenX),
      y: Number(element.dataset.portalScreenY),
    }));
    const size = await canvas.evaluate(element => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    const box = await canvas.boundingBox();
    if (!box) throw new Error('World canvas is not mounted');
    expect(Number.isFinite(marker.x) && Number.isFinite(marker.y)).toBe(true);
    await canvas.click({ position: {
      x: marker.x * box.width / size.width,
      y: marker.y * box.height / size.height,
    } });
    await page.waitForTimeout(120);
    expect(intercepted).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  await expect(page.getByTestId('world-portal-entering')).toHaveCount(0);
  expect(api.getEntryCalls()).toBe(1);
});


test('transient private portal-list failure recovers without clearing an independent entry error', async ({ page }) => {
  test.setTimeout(85_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page);
  let lists = 0;
  // Only the initial owner-only GET fails; the real polling effect retries.
  await page.route('**/api/personal-content/world-portals', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    lists++;
    if (lists === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ code: 'portal_request_failed' }) });
    } else {
      await route.fallback();
    }
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portal-error')).toBeVisible();
  await expect(page.getByTestId('world-portals')).toHaveCount(0);
  await expect.poll(() => lists, { timeout: 25_000 }).toBeGreaterThan(1);
  await expect(page.getByTestId('world-portals')).toBeVisible();
  await expect(page.getByTestId('world-portal-error')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '1');
  expect(api.getEntryCalls()).toBe(0);

  // An entry POST error is distinct: the next successful list refresh must
  // not erase the rejection warning while the player decides to retry.
  await page.route('**/api/personal-content/world-portals/' + grantId + '/enter', route =>
    route.fulfill({ status: 503, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ code: 'portal_request_failed' }) }));
  await page.getByTestId('world-portal-enter').click();
  await expect(page.getByTestId('world-portal-error')).toBeVisible();
  const afterEntry = lists;
  await expect.poll(() => lists, { timeout: 25_000 }).toBeGreaterThan(afterEntry);
  await expect(page.getByTestId('world-portal-error')).toBeVisible();
  expect(api.getEntryCalls()).toBe(0);
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true);
});

test('slow owner-only portal list GET cannot overlap another refresh or rejoin', async ({ page }) => {
  test.setTimeout(50_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  let listCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve });
  await page.route('**/api/personal-content/world-portals', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    listCalls++;
    if (listCalls === 1) await gate;
    await route.fallback();
  });
  try {
    await page.goto(origin + '/Vuxo/#/game');
    await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
    await expect.poll(() => listCalls).toBe(1);
    // The original setInterval creates a second pending request at 15s.
    // Completion-based scheduling guarantees just one flight until release.
    await page.waitForTimeout(16_000);
    expect(listCalls).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByTestId('world-portals')).toBeVisible();
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '1');
  expect(api.getEntryCalls()).toBe(0);
});

test('rejected portal entry unlocks input and permits an explicit retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const api = await mockPrivatePortals(page);
  let requests = 0;
  await page.route('**/api/personal-content/world-portals/' + grantId + '/enter', async route => {
    requests++;
    if (requests === 1) {
      await route.fulfill({ status: 503, headers: cors, contentType: 'application/json',
        body: JSON.stringify({ code: 'portal_request_failed' }) });
    } else {
      await route.fallback();
    }
  });
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const action = page.getByTestId('world-portal-enter');
  await expect(action).toBeEnabled();
  await action.click();
  await expect(page.getByTestId('world-portal-error')).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(page.getByTestId('touch-right')).toBeEnabled();
  await expect(page.getByTestId('world-portal-entering')).toHaveCount(0);
  expect(api.getEntryCalls()).toBe(0);
  await action.click();
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(requests).toBe(2);
  expect(api.getEntryCalls()).toBe(1);
});


test('late owner-only GET cannot resurrect a server-completed portal while another grant stays visible', async ({ page }, info) => {
  test.setTimeout(95_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const otherGrantId = '22222222-2222-4222-8222-222222222222';
  const other = { id: otherGrantId, contentKey: 'portal.grove', x: 5.5, y: 4.5 };
  const api = await mockPrivatePortals(page, 4.5, 4.5, [other]);
  let calls = 0;
  let releaseStale!: () => void;
  const staleGate = new Promise<void>(resolve => { releaseStale = resolve });
  // Snapshot deliberately captured *before* the authoritative challenge.
  // A private GET already in flight must not replay a consumed grant later.
  const staleMarkers = [
    { id: grantId, contentKey: 'portal.grove', x: 4.5, y: 4.5 }, other,
  ];
  await page.route('**/api/personal-content/world-portals', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    calls++;
    if (calls === 2) {
      await staleGate;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify(staleMarkers) });
    } else {
      await route.fallback();
    }
  });

  const host = page.getByTestId('game-canvas');
  const spent = page.locator('[data-testid="world-portal-enter"][data-grant-id="' + grantId + '"]');
  const retained = page.locator('[data-testid="world-portal-enter"][data-grant-id="' + otherGrantId + '"]');
  try {
    await page.goto(origin + '/Vuxo/#/game');
    await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
    await expect(host).toHaveAttribute('data-e2e-portal-list-refresh-revision', '1');
    await expect(host).toHaveAttribute('data-rendered-portals', '2');
    await expect(spent).toBeEnabled();
    await expect(retained).toBeEnabled();

    // The first poll settles, but the second one waits beyond its start.
    // Complete the challenge while that old GET is still unanswered.
    await expect.poll(() => calls, { timeout: 24_000 }).toBe(2);
    await spent.click();
    await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
    await expect(page.getByTestId('portal-preview')).toBeVisible();
    await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
    for (const rune of sequence) await page.getByTestId('portal-rune-' + rune).click();
    await page.getByTestId('portal-submit').click();
    await expect(page.getByTestId('portal-complete')).toBeVisible();
    await expect(spent).toHaveCount(0);
    // The second grant survives, but the existing modal lock deliberately
    // disables all HUD entry buttons while the challenge dialog is open.
    await expect(retained).toBeVisible();
    await expect(retained).toBeDisabled();
    await expect(host).toHaveAttribute('data-rendered-portals', '1');
    expect(api.getEntryCalls()).toBe(1);
    expect(api.getAttempts()).toBe(1);

    releaseStale();
    // Observe the *second GET actually being accepted*, not just the
    // preexisting one-marker DOM, before asserting the race is fixed.
    await expect(host).toHaveAttribute('data-e2e-portal-list-refresh-revision', '2');
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(spent).toHaveCount(0);
    await expect(retained).toBeVisible();
    await expect(retained).toBeDisabled();
    await expect(host).toHaveAttribute('data-rendered-portals', '1');
    await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
    await info.attach('completed-portal-not-resurrected-390px', {
      body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
    });

    // The next *fresh* private GET confirms the spent grant is absent,
    // clearing the temporary local reconciliation state.
    await expect(host).toHaveAttribute('data-e2e-portal-list-refresh-revision', '3',
      { timeout: 24_000 });
    await expect(spent).toHaveCount(0);
    await expect(retained).toBeVisible();
    await expect(host).toHaveAttribute('data-rendered-portals', '1');
    // Once the modal closes, the untouched owner's second portal becomes
    // actionable again; no forced entry or client-owned permission bypass.
    await page.getByRole('dialog').press('Escape');
    await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
    await expect(retained).toBeEnabled();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
      && document.documentElement.scrollHeight <= innerHeight + 1
    )).toBe(true);
  } finally {
    releaseStale();
  }
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


test('far owner portal art pauses offscreen and reappears after ultrawide camera resize without rebuilding or losing the near click target', async ({ page }, info) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await initializePlayer(page, 'en');
  const distantId = '33333333-3333-4333-8333-333333333333';
  const api = await mockPrivatePortals(page, 4.5, 4.5, [
    { id: distantId, contentKey: 'portal.grove', x: 30, y: 4.5 },
  ]);
  await page.goto(origin + '/Vuxo/#/game');
  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '2');

  type PortalArt = {
    count: number; builds: number; visible: boolean[]; hovered: boolean[];
    hitRadii: number[]; hitScales: number[][]; haloAlphas: number[];
    coreScales: number[]; reducedMotion: boolean;
  };
  const art = async (): Promise<PortalArt> =>
    JSON.parse((await host.getAttribute('data-e2e-portal-art')) ?? '{}') as PortalArt;
  await expect.poll(async () => (await art()).visible).toEqual([true, false]);
  const initial = await art();
  expect(initial.builds).toBe(2);
  expect(initial.count).toBe(2);
  expect(initial.hitRadii).toEqual([19, 19]);
  expect(initial.hitScales).toEqual([[1, 1], [1, 1]]);
  await page.waitForTimeout(220);
  // A distant grant still exists but its halo does not animate offscreen.
  expect((await art()).haloAlphas[1]).toBe(initial.haloAlphas[1]);
  expect(await page.locator('[data-testid="world-portal-enter"]').count()).toBe(2);
  await info.attach('portals-near-and-culled-mobile-390px', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });

  // Zoom-adjusted camera worldView on an ultrawide display contains both
  // server-owned markers; the same seven GameObjects become visible again.
  await page.setViewportSize({ width: 3440, height: 1440 });
  await expect.poll(async () => (await art()).visible).toEqual([true, true]);
  expect((await art()).builds).toBe(2);
  const wideAlpha = (await art()).haloAlphas[1];
  await expect.poll(async () => Math.abs((await art()).haloAlphas[1] - wideAlpha))
    .toBeGreaterThan(0.025);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await art()).haloAlphas).toEqual([0.2, 0.2]);
  expect((await art()).coreScales).toEqual([1, 1]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await info.attach('portals-near-and-far-ultrawide', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });

  // Back on mobile only decorative rendering is culled, not grant/HUD data.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await art()).visible).toEqual([true, false]);
  const frozenAlpha = (await art()).haloAlphas[1];
  await page.waitForTimeout(220);
  expect((await art()).haloAlphas[1]).toBe(frozenAlpha);
  expect((await art()).builds).toBe(2);
  expect((await art()).hovered[1]).toBe(false);
  const near = page.locator('[data-testid="world-portal-enter"][data-grant-id="' + grantId + '"]');
  const distant = page.locator('[data-testid="world-portal-enter"][data-grant-id="' + distantId + '"]');
  await expect(near).toBeEnabled();
  await expect(distant).toBeDisabled();
  await expect.poll(() => host.evaluate(element => {
    const canvas = element.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const x = Number(element.dataset.portalScreenX);
    const y = Number(element.dataset.portalScreenY);
    return Number.isFinite(x) && Number.isFinite(y) &&
      x > 19 && x < canvas.width - 19 &&
      y > 19 && y < canvas.height - 19;
  })).toBe(true);
  const marker = await host.evaluate(element => {
    const canvas = element.querySelector('canvas') as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Number(element.dataset.portalScreenX) * bounds.width / canvas.width,
      y: Number(element.dataset.portalScreenY) * bounds.height / canvas.height,
    };
  });
  await canvas.click({ position: marker });
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
  expect((await art()).hitScales).toEqual([[1, 1], [1, 1]]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1
  )).toBe(true);
});

test('runic portal light animates without changing click hit area and freezes on live reduced motion', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page);
  await mockPrivatePortals(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/Vuxo/#/game');

  const host = page.getByTestId('game-canvas');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');

  type Art = {
    count: number;
    reducedMotion: boolean;
    hitScales: number[][];
    haloAlphas: number[];
    coreScales: number[];
  };
  const readArt = async (): Promise<Art> =>
    JSON.parse((await host.getAttribute('data-e2e-portal-art')) ?? '{}') as Art;

  await expect.poll(async () => (await readArt()).count).toBe(1);
  const first = await readArt();
  expect(first.hitScales).toEqual([[1, 1]]);
  await expect.poll(async () => {
    const current = await readArt();
    return current.count === 1 && current.hitScales[0][0] === 1
      && current.hitScales[0][1] === 1
      && Math.abs(current.haloAlphas[0] - first.haloAlphas[0]) >= 0.025;
  }).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => {
    const current = await readArt();
    return current.reducedMotion && current.count === 1
      && current.haloAlphas[0] === 0.2
      && current.coreScales[0] === 1
      && JSON.stringify(current.hitScales) === '[[1,1]]';
  }).toBe(true);
  await page.waitForTimeout(160);
  const frozen = await readArt();
  expect(frozen.haloAlphas).toEqual([0.2]);
  expect(frozen.coreScales).toEqual([1]);
  expect(frozen.hitScales).toEqual([[1, 1]]);

  await info.attach('illustrated-portal-mobile-reduced-motion', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await readArt()).hitScales).toEqual([[1, 1]]);
  await info.attach('illustrated-portal-desktop', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await readArt()).reducedMotion).toBe(false);
});

test('runic portal hover responds to real mouse input, preserves the 19px target and freezes under reduced motion', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/Vuxo/#/game');

  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  await expect(host).toHaveAttribute('data-portal-screen-x', /[0-9]/);
  await expect(host).toHaveAttribute('data-portal-screen-y', /[0-9]/);

  type HoverArt = {
    count: number; reducedMotion: boolean; hovered: boolean[];
    hitScales: number[][]; hitRadii: number[]; haloAlphas: number[];
    coreScales: number[];
  };
  const art = async (): Promise<HoverArt> =>
    JSON.parse((await host.getAttribute('data-e2e-portal-art')) ?? '{}') as HoverArt;
  const moveToMarker = async () => {
    const marker = await host.evaluate(element => ({
      x: Number(element.dataset.portalScreenX),
      y: Number(element.dataset.portalScreenY),
    }));
    const dimensions = await canvas.evaluate(element => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    const box = await canvas.boundingBox();
    if (!box) throw new Error('World canvas is not mounted');
    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
    expect(marker.x).toBeGreaterThan(0);
    expect(marker.y).toBeGreaterThan(0);
    expect(marker.x).toBeLessThan(dimensions.width);
    expect(marker.y).toBeLessThan(dimensions.height);
    await page.mouse.move(
      box.x + marker.x * box.width / dimensions.width,
      box.y + marker.y * box.height / dimensions.height,
    );
  };

  await expect.poll(async () => (await art()).hovered?.[0]).toBe(false);
  await expect.poll(async () => (await art()).hitRadii).toEqual([19]);
  await moveToMarker();
  await expect.poll(async () => (await art()).hovered?.[0]).toBe(true);
  await expect.poll(async () => (await art()).haloAlphas[0]).toBeGreaterThan(0.29);
  await expect.poll(async () => (await art()).hitScales).toEqual([[1, 1]]);
  expect((await art()).hitRadii).toEqual([19]);
  await info.attach('portal-desktop-pointer-hover', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => {
    const current = await art();
    return current.reducedMotion && current.hovered[0] && current.haloAlphas[0] === 0.38
      && current.coreScales[0] === 1 && current.hitRadii[0] === 19
      && JSON.stringify(current.hitScales) === '[[1,1]]';
  }).toBe(true);
  await page.waitForTimeout(160);
  expect((await art()).haloAlphas).toEqual([0.38]);

  // Leave the portal but stay inside the world canvas: Phaser pointerout.
  const viewport = await canvas.boundingBox();
  if (!viewport) throw new Error('World canvas is not mounted');
  await page.mouse.move(viewport.x + viewport.width - 8, viewport.y + viewport.height / 2);
  await expect.poll(async () => (await art()).hovered?.[0]).toBe(false);
  await expect.poll(async () => (await art()).haloAlphas).toEqual([0.2]);
  // Then leave the *canvas* directly from the portal. A GameObject
  // pointerout is not fired for this path: it must use Phaser GAME_OUT.
  await moveToMarker();
  await expect.poll(async () => (await art()).hovered?.[0]).toBe(true);
  await page.mouse.move(2, 2);
  await expect.poll(async () => (await art()).hovered?.[0]).toBe(false);
  await expect.poll(async () => (await art()).haloAlphas).toEqual([0.2]);
  expect(api.getEntryCalls()).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  // A viewport transition temporarily changes Phaser's camera projection.
  // Join the scene at its actual mobile size rather than targeting a stale
  // desktop coordinate while the follow camera is still resizing.
  await page.reload();
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  await expect.poll(async () => {
    const position = await host.evaluate(element => ({
      x: Number(element.dataset.portalScreenX),
      y: Number(element.dataset.portalScreenY),
    }));
    const size = await canvas.evaluate(element => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    return Number.isFinite(position.x) && Number.isFinite(position.y)
      && position.x > 19 && position.x < size.width - 19
      && position.y > 19 && position.y < size.height - 19;
  }).toBe(true);
  await expect.poll(async () => {
    await moveToMarker();
    return (await art()).hovered?.[0];
  }).toBe(true);
  await expect.poll(async () => (await art()).haloAlphas).toEqual([0.38]);
  await info.attach('portal-mobile-reduced-motion-hover', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
});


test('same owner grant relocates its Phaser art and 19px click target after a fresh API poll', async ({ page }, info) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page);
  const api = await mockPrivatePortals(page);
  await page.goto(origin + '/Vuxo/#/game');

  const host = page.getByTestId('game-canvas');
  const canvas = host.locator('canvas');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(host).toHaveAttribute('data-rendered-portals', '1');
  type PortalArt = {
    count: number; builds: number; hitCenters: number[][];
    hitRadii: number[]; hitScales: number[][];
  };
  const art = async () => JSON.parse(
    (await host.getAttribute('data-e2e-portal-art')) ?? '{}'
  ) as PortalArt;
  await expect.poll(async () => (await art()).hitCenters).toEqual([[4.5 * 32, 4.5 * 32]]);
  expect((await art()).builds).toBe(1);
  const pollsBeforeRelocation = api.getListCalls();
  expect(pollsBeforeRelocation).toBeGreaterThan(0);

  // Only the Playwright private-API fixture changes the owner marker. The
  // normal 15s production refresh must notice the same grant with a new
  // position; no fake Phaser scene event, client position write or rejoin.
  api.relocate(8.5, 4.5);
  await expect.poll(() => api.getListCalls(), { timeout: 24_000 })
    .toBeGreaterThan(pollsBeforeRelocation);
  await expect.poll(async () => (await art()).hitCenters).toEqual([[8.5 * 32, 4.5 * 32]]);
  const rebuilt = await art();
  expect(rebuilt.count).toBe(1);
  expect(rebuilt.builds).toBe(2);
  expect(rebuilt.hitRadii).toEqual([19]);
  expect(rebuilt.hitScales).toEqual([[1, 1]]);
  // No repaint/rebuild each animation frame when the owner snapshot stays
  // identical. Both ring and absolute-coordinate Graphics were replaced.
  await page.waitForTimeout(180);
  expect((await art()).builds).toBe(2);

  const screen = await host.evaluate(element => ({
    x: Number(element.dataset.portalScreenX),
    y: Number(element.dataset.portalScreenY),
    zoom: Number(element.getAttribute('data-e2e-camera-zoom')),
  }));
  expect(Number.isFinite(screen.x) && Number.isFinite(screen.y)).toBe(true);
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('World canvas missing');
  const dimensions = await canvas.evaluate(element => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const toCanvas = (x: number, y: number) => ({
    x: x * bounds.width / dimensions.width,
    y: y * bounds.height / dimensions.height,
  });
  const previousX = screen.x - 4 * 32 * screen.zoom;
  expect(previousX).toBeGreaterThan(19);
  expect(screen.x).toBeLessThan(dimensions.width - 19);
  // Old owner's marker was destroyed: the former interactive ring must not
  // silently enter a grant after the API relocates it.
  await canvas.click({ position: toCanvas(previousX, screen.y) });
  await expect(page.getByTestId('world-portal-dialog')).toHaveCount(0);
  expect(api.getEntryCalls()).toBe(0);

  await info.attach('relocated-owner-portal-390px', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await canvas.click({ position: toCanvas(screen.x, screen.y) });
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
  expect(api.getEntryCalls()).toBe(1);
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
  const selfPresence = page.getByTestId('world-presence-self');
  await expect(selfPresence).toHaveAttribute('data-player-id', 'portal-player');
  await expect(selfPresence).toHaveAttribute('data-self', 'true');
  await expect(selfPresence).toHaveAttribute('aria-label', 'Tu: Portal Vuxian');

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
  await expect(selfPresence).toHaveAttribute('aria-label', 'You: Portal Vuxian');
  expect(api.getListCalls()).toBe(1);
});

test('crowded portal action HUD is compact on mobile and can reveal every owner grant without losing its API number', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  const far = Array.from({ length: 9 }, (_, index) => ({
    id: 'far-portal-' + index, contentKey: 'portal.grove', x: 50.5 + index, y: 4.5,
  }));
  const nearbyGrantId = '33333333-3333-4333-8333-333333333333';
  const api = await mockPrivatePortals(page, 40.5, 4.5, [
    ...far,
    { id: nearbyGrantId, contentKey: 'portal.grove', x: 4.5, y: 4.5 },
  ]);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const actions = page.getByTestId('world-portal-enter');
  const toggle = page.getByTestId('world-portal-more');
  await expect(actions).toHaveCount(6);
  await expect(actions.first()).toHaveAttribute('data-grant-id', nearbyGrantId);
  await expect(actions.first()).toHaveAttribute('data-portal-number', '11');
  await expect(actions.first()).toBeEnabled();
  await expect(page.getByTestId('world-portal-compass')).toHaveAttribute('data-target-number', '11');
  await expect(toggle).toContainText('5 more portals');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(actions).toHaveCount(11);
  // Playwright's hasText uses substring matching: "Enter portal 1"
  // also matches "Enter portal 11". Assert the canonical API number and
  // complete label to distinguish both grants after expanding the HUD.
  const portalOne = page.locator('[data-testid="world-portal-enter"][data-portal-number="1"]');
  const portalEleven = page.locator('[data-testid="world-portal-enter"][data-portal-number="11"]');
  await expect(portalOne).toHaveCount(1);
  await expect(portalEleven).toHaveCount(1);
  await expect(portalOne).toHaveText('Enter portal 1');
  await expect(portalEleven).toHaveText('Enter portal 11');
  await expect(portalOne).toBeDisabled();
  await expect(portalEleven).toBeEnabled();
  await toggle.click();
  await expect(actions).toHaveCount(6);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(api.getEntryCalls()).toBe(0);
  expect(api.getListCalls()).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1
    && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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
  // The action panel mirrors compass/radar proximity without renumbering
  // grants or granting permission to enter a still-distant portal.
  const actions = page.getByTestId('world-portal-enter');
  await expect(actions).toHaveCount(2);
  await expect(actions.first()).toHaveAttribute('data-portal-number', '2');
  await expect(actions.first()).toHaveAttribute('data-grant-id', '22222222-2222-4222-8222-222222222222');
  await expect(actions.first()).toHaveText('Enter portal 2');
  await expect(actions.first()).toBeDisabled();
  await expect(actions.nth(1)).toHaveAttribute('data-portal-number', '1');
  await expect(actions.nth(1)).toHaveAttribute('data-grant-id', grantId);
  expect(api.getEntryCalls()).toBe(0);
});

test('invalid private marker positions cannot create a phantom portal or entry action', async ({ page }) => {
  await initializePlayer(page);
  const api = await mockPrivatePortals(page, Number.NaN, Number.NaN);
  // JSON.stringify serializes NaN as null. Without runtime validation,
  // Phaser's null * TILE_SIZE would accidentally create a portal at (0,0).
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portals')).toHaveCount(0);
  await expect(page.getByTestId('world-portal-enter')).toHaveCount(0);
  await expect(page.getByTestId('world-portal-compass')).toHaveCount(0);
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '0');
  expect(api.getEntryCalls()).toBe(0);
});

test('invalid private marker does not hide a valid owner-granted portal', async ({ page }) => {
  await initializePlayer(page, 'en');
  const valid = '22222222-2222-4222-8222-222222222222';
  const api = await mockPrivatePortals(page, Number.NaN, Number.NaN, [
    { id: valid, contentKey: 'portal.grove', x: 5.5, y: 4.5 },
  ]);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const action = page.getByTestId('world-portal-enter');
  await expect(action).toHaveCount(1);
  await expect(action).toHaveAttribute('data-grant-id', valid);
  await expect(action).toBeEnabled();
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '1');
  expect(api.getEntryCalls()).toBe(0);
});

test('malformed world portal list reports an error instead of rendering a marker', async ({ page }) => {
  await initializePlayer(page, 'en');
  await page.route('**/api/personal-content/world-portals', route =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ id: grantId, x: 0, y: 0 }) }));
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  await expect(page.getByTestId('world-portal-error')).toBeVisible();
  await expect(page.getByTestId('world-portals')).toHaveCount(0);
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '0');
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


test('desktop exploration radar folds without losing authorized markers or keyboard access', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await initializePlayer(page, 'it');
  const api = await mockPrivatePortals(page, 18.5, 4.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const radar = page.getByTestId('world-radar');
  const toggle = page.getByTestId('world-radar-toggle');
  await expect(radar).toHaveAttribute('data-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Chiudi radar');
  await expect(toggle).toHaveAttribute('aria-controls', 'world-radar-details');
  await expect(page.locator('#world-radar-details')).toHaveCount(1);
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await expect(page.getByTestId('world-radar-chart')).toBeVisible();
  const originalHeight = await radar.evaluate(element => element.getBoundingClientRect().height);
  await info.attach('desktop-radar-open', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Apri radar');
  await expect(page.locator('#world-radar-details')).toHaveCount(1);
  await expect(page.getByTestId('world-radar-chart')).toHaveCount(0);
  const closedHeight = await radar.evaluate(element => element.getBoundingClientRect().height);
  expect(closedHeight).toBeLessThan(originalHeight);
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await info.attach('desktop-radar-closed', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });

  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await page.getByTestId('language-toggle').click();
  await expect(toggle).toHaveAttribute('aria-label', 'Close radar');
  expect(api.getEntryCalls()).toBe(0);
});

test('radar viewport defaults and explicit visibility choice remain predictable across resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initializePlayer(page, 'en');
  await mockPrivatePortals(page, 18.5, 4.5);
  await page.goto(origin + '/Vuxo/#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
  const radar = page.getByTestId('world-radar');
  const toggle = page.getByTestId('world-radar-toggle');
  await expect(radar).toHaveAttribute('data-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'world-radar-details');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(radar).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(radar).toHaveAttribute('data-expanded', 'false');

  await page.setViewportSize({ width: 1280, height: 720 });
  await toggle.click();
  await expect(radar).toHaveAttribute('data-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(radar).toHaveAttribute('data-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Open radar');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(radar).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByTestId('world-radar-portal')).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(radar).toHaveAttribute('data-expanded', 'true');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
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
