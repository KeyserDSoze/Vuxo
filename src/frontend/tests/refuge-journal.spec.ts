import { expect, test, type Page } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const runeGrant = '11111111-1111-4111-8111-111111111111';
const groveGrant = '22222222-2222-4222-8222-222222222222';
const tideGrant = '33333333-3333-4333-8333-333333333333';
const nearPortal = '44444444-4444-4444-8444-444444444444';
const laterPortal = '55555555-5555-4555-8555-555555555555';

const rewards = [
  { grantId: groveGrant, itemKey: 'item.grove_seed.v1', quantity: 2,
    awardedAtUtc: '2026-11-02T12:00:00Z', consumed: true },
  { grantId: runeGrant, itemKey: 'item.rune_shard.v1', quantity: 1,
    awardedAtUtc: '2026-11-05T12:00:00Z', consumed: false },
  { grantId: tideGrant, itemKey: 'item.tidal_pearl.v1', quantity: 1,
    awardedAtUtc: '2026-11-03T12:00:00Z' },
];

const portals = [
  { id: laterPortal, contentKey: 'portal.memory.tides', portalKey: 'challenge.sequence.v1',
    expiresAtUtc: '2099-11-30T12:00:00Z' },
  { id: nearPortal, contentKey: 'portal.memory.grove', portalKey: 'challenge.sequence.v1',
    expiresAtUtc: '2099-11-10T12:00:00Z' },
  { id: '66666666-6666-4666-8666-666666666666', contentKey: 'not-a-portal',
    portalKey: 'other.challenge', expiresAtUtc: null },
];

test.beforeEach(async ({ page }) => {
  // The completed-history read model is independent of item grants and
  // currently available portal grants; keep legacy journal fixtures isolated.
  await page.route('**/api/personal-content/history/completed*', route => route.fulfill({
    headers: corsHeaders, contentType: 'application/json',
    body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }),
  }));
});

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.accessToken', 'journal-owner-one');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-one', displayName: 'Journal Hero', email: null,
    }));
  }, { language });
}

async function mockJournal(page: Page) {
  await page.route('**/api/inventory', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify(rewards),
  }));
  await page.route('**/api/personal-content', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify(portals),
  }));
}

test('guest can open Refuge journal but makes no owner API calls', async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('vuxo.language', 'it'); });
  const privateRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/(inventory|personal-content)/.test(new URL(request.url()).pathname)) {
      privateRequests.push(request.url());
    }
  });
  await page.goto('./#/refuge');
  await page.getByTestId('refuge-activity-journal').click();
  await expect(page).toHaveURL(/#\/refuge\/journal$/);
  await expect(page.getByTestId('refuge-journal-auth-required')).toContainText('Accedi');
  await expect(page.getByTestId('refuge-journal-rewards')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-portals')).toHaveCount(0);
  expect(privateRequests).toEqual([]);
});

test('reward grants display in chronological order and only available portal grants are shown', async ({ page }) => {
  await signIn(page);
  await mockJournal(page);
  await page.goto('./#/refuge/journal');
  await expect(page.getByRole('heading', { name: 'Diario del Rifugio' })).toBeVisible();
  const entries = page.getByTestId('refuge-journal-reward');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText('Frammento di runa');
  await expect(entries.nth(1)).toContainText('Perla delle maree');
  await expect(entries.nth(2)).toContainText('Seme del bosco');
  await expect(entries.nth(2)).toHaveAttribute('data-consumed', 'true');
  await expect(page.getByTestId('refuge-journal-rewards-count')).toContainText('3 su 3');

  const activePortals = page.getByTestId('refuge-journal-portal');
  await expect(activePortals).toHaveCount(2);
  await expect(activePortals.nth(0)).toContainText('44444444');
  await expect(activePortals.nth(1)).toContainText('55555555');
  await expect(page.getByTestId('refuge-journal-portals-count')).toContainText('2');
  await expect(page.getByTestId('refuge-journal-limits')).toContainText('Non è lo storico completo');
  await expect(page.getByTestId('refuge-journal-open-inventory')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-journal-open-portals')).toHaveAttribute('href', '#/portals');
});

test('reward filter uses only server consumed status, not browser inventories or gameplay APIs', async ({ page }) => {
  await signIn(page);
  await mockJournal(page);
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);

  const unexpected: string[] = [];
  page.on('request', request => {
    if (/\/api\/(inventory|personal-content)/.test(new URL(request.url()).pathname)) {
      unexpected.push(request.method() + ':' + request.url());
    }
  });
  await page.getByTestId('refuge-journal-filter').click();
  await page.getByRole('option', { name: 'Non consumati' }).click();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-rewards-count')).toContainText('2 su 3');

  await page.getByTestId('refuge-journal-filter').click();
  await page.getByRole('option', { name: 'Consumati', exact: true }).click();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(1);
  await expect(page.getByTestId('refuge-journal-reward')).toContainText('Seme del bosco');
  expect(unexpected).toEqual([]);
});

test('inventory 503 leaves portals visible; retry only re-reads inventory', async ({ page }) => {
  await signIn(page);
  let broken = true;
  let inventoryCalls = 0;
  let portalCalls = 0;
  await page.route('**/api/inventory', route => {
    inventoryCalls++;
    return broken
      ? route.fulfill({ headers: corsHeaders, status: 503 })
      : route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(rewards) });
  });
  await page.route('**/api/personal-content', route => {
    portalCalls++;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(portals) });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-rewards-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-portal')).toHaveCount(2);
  broken = false;
  const portalCallsBeforeRetry = portalCalls;
  const inventoryCallsBeforeRetry = inventoryCalls;
  await page.getByTestId('refuge-journal-rewards-refresh').click();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);
  await expect(page.getByTestId('refuge-journal-rewards-error')).toHaveCount(0);
  expect(inventoryCalls).toBeGreaterThan(inventoryCallsBeforeRetry);
  expect(portalCalls).toBe(portalCallsBeforeRetry);
});

test('portal 503 never becomes an empty portal list; independent portal retry recovers', async ({ page }) => {
  await signIn(page);
  let broken = true;
  await page.route('**/api/inventory', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify(rewards),
  }));
  await page.route('**/api/personal-content', route =>
    broken ? route.fulfill({ headers: corsHeaders, status: 503 }) : route.fulfill({ headers: corsHeaders,
      contentType: 'application/json', body: JSON.stringify([]),
    }),
  );
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);
  await expect(page.getByTestId('refuge-journal-portals-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toHaveCount(0);
  broken = false;
  await page.getByTestId('refuge-journal-portals-refresh').click();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toContainText('Nessun portale disponibile');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);
});

test('full refresh hides stale records until both owner reads finish', async ({ page }) => {
  await signIn(page);
  let refreshed = false;
  let finishRewards!: () => void;
  let finishPortals!: () => void;
  const rewardsGate = new Promise<void>(resolve => { finishRewards = resolve; });
  const portalsGate = new Promise<void>(resolve => { finishPortals = resolve; });
  await page.route('**/api/inventory', async route => {
    if (refreshed) await rewardsGate;
    return route.fulfill({ headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify(refreshed ? [] : rewards),
    });
  });
  await page.route('**/api/personal-content', async route => {
    if (refreshed) await portalsGate;
    return route.fulfill({ headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify(refreshed ? [] : portals),
    });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);
  await expect(page.getByTestId('refuge-journal-portal')).toHaveCount(2);
  refreshed = true;
  await page.getByTestId('refuge-journal-refresh-all').click();
  await expect(page.getByTestId('refuge-journal-rewards-loading')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-loading')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-portal')).toHaveCount(0);
  finishRewards();
  finishPortals();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();
});

test('account switch and logout immediately hide the previous owner journal', async ({ page }) => {
  await signIn(page);
  let releaseSecond!: () => void;
  const waitSecond = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/api/inventory', async route => {
    const second = route.request().headers()['authorization'] === 'Bearer journal-owner-two';
    if (second) await waitSecond;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(second ? [] : rewards) });
  });
  await page.route('**/api/personal-content', async route => {
    const second = route.request().headers()['authorization'] === 'Bearer journal-owner-two';
    if (second) await waitSecond;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(second ? [] : portals) });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);

  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'journal-owner-two');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-two', displayName: 'Other Hero', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-portal')).toHaveCount(0);
  releaseSecond();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-journal-auth-required')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-rewards')).toHaveCount(0);
});

test('English dark mobile journal is readable at 320px without Phaser or POST actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'en');
  await mockJournal(page);
  const unexpected: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS' && /\/api\/(inventory|personal-content)/.test(pathname)) {
      unexpected.push(request.url());
    }
    if (/\/assets\/GamePage-[^/]+\.js/.test(pathname)) unexpected.push(request.url());
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByRole('heading', { name: 'Refuge journal' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('refuge-journal-rewards-count')).toContainText('3 of 3');
  await expect(page.getByTestId('refuge-journal-limits')).toContainText('not a complete history');
  await page.getByTestId('refuge-journal-filter').click();
  await page.getByRole('option', { name: 'Consumed', exact: true }).click();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(unexpected).toEqual([]);
});

test('unknown rewards and filtered-empty states never imply that inventory was deleted', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/inventory', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify([{
      grantId: '77777777-7777-4777-8777-777777777777',
      itemKey: 'item.future.unknown.v1', quantity: 1,
      awardedAtUtc: '2026-11-02T12:00:00Z', consumed: true,
    }]),
  }));
  await page.route('**/api/personal-content', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify([]),
  }));
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toContainText('Oggetto non ancora catalogato');
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();
  await page.getByTestId('refuge-journal-filter').click();
  await page.getByRole('option', { name: 'Non consumati' }).click();
  await expect(page.getByTestId('refuge-journal-rewards-no-match')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(0);
  await page.getByTestId('refuge-journal-filter').click();
  await page.getByRole('option', { name: 'Tutti' }).click();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(1);
});

test('returning to the Journal reconciles cross-device spending and portal consumption once', async ({ page }) => {
  await signIn(page);
  let spentElsewhere = false;
  let rewardGets = 0;
  let portalGets = 0;
  let historyGets = 0;
  const methods: string[] = [];
  await page.route('**/api/inventory', route => {
    methods.push(route.request().method());
    rewardGets++;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify(spentElsewhere ? [] : rewards) });
  });
  await page.route('**/api/personal-content', route => {
    methods.push(route.request().method());
    portalGets++;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify(spentElsewhere ? [] : portals) });
  });
  await page.route('**/api/personal-content/history/completed*', route => {
    methods.push(route.request().method());
    historyGets++;
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }) });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(3);
  await expect(page.getByTestId('refuge-journal-portal')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
  expect([rewardGets, portalGets, historyGets]).toEqual([1, 1, 1]);

  // Another device spent the grants and completed the available portals.
  spentElsewhere = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
  expect([rewardGets, portalGets, historyGets]).toEqual([2, 2, 2]);
  expect(methods.every(method => method === 'GET')).toBe(true);
});
