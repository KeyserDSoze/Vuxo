import { expect, test, type Page } from '@playwright/test';

const grantId = '11111111-1111-4111-8111-111111111111';
const sequence = ['sun', 'moon', 'star', 'wave'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown) => ({
  headers: cors, contentType: 'application/json', body: JSON.stringify(body),
});

function deferred() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

async function loginA(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'portal-owner-a');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'portal-owner-a', displayName: 'Owner A', email: null,
    }));
  });
}

async function loginB(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'portal-owner-b');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'portal-owner-b', displayName: 'Owner B', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
}

async function mockPortals(page: Page, heldStage: 'grants' | 'challenge' | 'attempt') {
  const held = deferred();
  const started = deferred();
  const attempts: string[] = [];
  const calls: string[] = [];
  await page.route('**/api/personal-content**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const owner = request.headers()['authorization'] ?? '';
    const pathname = new URL(request.url()).pathname;
    const stage = request.method() === 'POST' && pathname.endsWith('/challenge/attempt')
      ? 'attempt' : pathname.endsWith('/challenge') ? 'challenge'
        : pathname === '/api/personal-content' ? 'grants' : 'other';
    calls.push(owner + ':' + stage);
    if (stage === 'attempt') attempts.push(owner);
    if (owner === 'Bearer portal-owner-a' && stage === heldStage) {
      started.release();
      await held.pending;
    }
    let result: unknown = [];
    if (stage === 'grants') {
      result = owner === 'Bearer portal-owner-a'
        ? [{ id: grantId, portalKey: 'challenge.sequence.v1',
          contentKey: 'portal.memory.grove', expiresAtUtc: null }] : [];
    } else if (stage === 'challenge') {
      result = { grantId, version: 'portal-sequence-v1', sequence };
    } else if (stage === 'attempt') {
      result = { id: grantId, itemKey: 'item.rune_shard.v1' };
    }
    // After an account switch the old browser fetch can already be aborted.
    await route.fulfill(json(result)).catch(() => {});
  });
  return { started: started.pending, release: held.release, attempts, calls };
}

test('late grant listing from A cannot populate the newly logged-in owner B', async ({ page }) => {
  await loginA(page);
  const mock = await mockPortals(page, 'grants');
  await page.goto('./#/portals');
  await mock.started;
  await loginB(page);
  await expect(page.getByTestId('portal-empty')).toBeVisible();
  mock.release();
  await expect(page.getByTestId('portal-start')).toHaveCount(0);
  expect(mock.calls).toContain('Bearer portal-owner-b:grants');
  expect(mock.attempts).toHaveLength(0);
});

test('pending secret rune preview of A is revoked on account switch', async ({ page }) => {
  await loginA(page);
  const mock = await mockPortals(page, 'challenge');
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await mock.started;
  await loginB(page);
  await expect(page.getByTestId('portal-empty')).toBeVisible();
  mock.release();
  await expect(page.getByTestId('portal-challenge')).toHaveCount(0);
  await expect(page.getByTestId('portal-preview')).toHaveCount(0);
  expect(mock.attempts).toHaveLength(0);
});

test('a late successful POST from A cannot show a win or reward under B', async ({ page }) => {
  await loginA(page);
  const mock = await mockPortals(page, 'attempt');
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  for (const rune of sequence) await page.getByTestId('portal-rune-' + rune).click();
  await page.getByTestId('portal-submit').click();
  await mock.started;
  await loginB(page);
  await expect(page.getByTestId('portal-empty')).toBeVisible();
  mock.release();
  await expect(page.getByTestId('portal-complete')).toHaveCount(0);
  await expect(page.getByTestId('portal-award')).toHaveCount(0);
  expect(mock.attempts).toEqual(['Bearer portal-owner-a']);
});

test('rapid double submit sends exactly one mutating intention', async ({ page }) => {
  await loginA(page);
  const mock = await mockPortals(page, 'attempt');
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  for (const rune of sequence) await page.getByTestId('portal-rune-' + rune).click();
  await page.getByTestId('portal-submit').evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await mock.started;
  expect(mock.attempts).toEqual(['Bearer portal-owner-a']);
  mock.release();
  await expect(page.getByTestId('portal-complete')).toBeVisible();
  expect(mock.attempts).toHaveLength(1);
});

test('returning to available portals removes grants consumed by another device', async ({ page }) => {
  await loginA(page);
  let consumedElsewhere = false;
  let grantGets = 0;
  let posts = 0;
  await page.route('**/api/personal-content**', route => {
    const req = route.request();
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'POST') posts++;
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/personal-content') {
      grantGets++;
      return route.fulfill(json(consumedElsewhere ? [] : [{
        id: grantId, portalKey: 'challenge.sequence.v1',
        contentKey: 'portal.memory.grove', expiresAtUtc: null,
      }]));
    }
    return route.fulfill({ status: 404, headers: cors });
  });
  await page.goto('./#/portals');
  await expect(page.getByTestId('portal-start')).toBeVisible();
  expect(grantGets).toBe(1);
  consumedElsewhere = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('portal-empty')).toBeVisible();
  await expect(page.getByTestId('portal-start')).toHaveCount(0);
  expect(grantGets).toBe(2);
  expect(posts).toBe(0);
});

test('foreground refresh does not wipe an active rune challenge or issue another GET', async ({ page }) => {
  await loginA(page);
  const mock = await mockPortals(page, 'attempt');
  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-challenge')).toBeVisible();
  const before = mock.calls.filter(call => call.endsWith(':grants')).length;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('portal-challenge')).toBeVisible();
  expect(mock.calls.filter(call => call.endsWith(':grants')).length).toBe(before);
  expect(mock.attempts).toHaveLength(0);
});
