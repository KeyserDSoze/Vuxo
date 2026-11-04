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

async function mockPrivatePortals(page: Page, x = 4.5, y = 4.5) {
  let consumed = false;
  let entryCalls = 0;
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
      body = consumed ? [] : [{ id: grantId, contentKey: 'portal.grove', x, y }];
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
  return { getEntryCalls: () => entryCalls, getAttempts: () => attempts };
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
  await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-rendered-portals', '1');
  // Phaser's follow camera centers the local player; this marker shares
  // that authoritative tile, so it is at the canvas center.
  const box = await canvas.boundingBox();
  if (!box) throw new Error('World canvas is not mounted');
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByTestId('world-portal-dialog')).toBeVisible();
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
  expect(requests).toBe(0);
});
