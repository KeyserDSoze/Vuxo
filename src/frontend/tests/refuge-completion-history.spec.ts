import { expect, test, type Page } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const ownerGrantA = '11111111-1111-4111-8111-111111111111';
const ownerGrantB = '22222222-2222-4222-8222-222222222222';
const ownerGrantC = '33333333-3333-4333-8333-333333333333';
const completed = [
  { grantId: ownerGrantA, contentKey: 'portal.memory.grove',
    ruleVersion: 'personal-content-v1', grantedAtUtc: '2026-10-30T10:00:00Z',
    completedAtUtc: '2026-11-05T15:00:00Z' },
  { grantId: ownerGrantB, contentKey: 'portal.memory.tides',
    ruleVersion: 'personal-content-v1', grantedAtUtc: '2026-10-28T10:00:00Z',
    completedAtUtc: '2026-11-03T15:00:00Z' },
  { grantId: ownerGrantC, contentKey: 'portal.memory.grove',
    ruleVersion: 'personal-content-v1', grantedAtUtc: '2026-10-20T10:00:00Z',
    completedAtUtc: '2026-11-01T15:00:00Z' },
];

async function signIn(page: Page, locale: 'it' | 'en' = 'it') {
  await page.addInitScript(({ locale }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', locale);
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.accessToken', 'completion-owner-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'completion-owner', displayName: 'Explorer', email: null,
    }));
  }, { locale });
}

async function emptyOtherPanels(page: Page) {
  await page.route('**/api/inventory', route => route.fulfill({
    headers: corsHeaders, contentType: 'application/json', body: '[]',
  }));
  await page.route('**/api/personal-content', route => route.fulfill({
    headers: corsHeaders, contentType: 'application/json', body: '[]',
  }));
}

test('guest never reads completed history, and login link is available', async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('vuxo.language', 'it'); });
  const privateCalls: string[] = [];
  page.on('request', request => {
    if (/\/api\/personal-content\/history\/completed/.test(new URL(request.url()).pathname))
      privateCalls.push(request.url());
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-auth-required')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed')).toHaveCount(0);
  expect(privateCalls).toEqual([]);
});

test('verified completions paginate across server pages without guessing rewards', async ({ page }) => {
  await signIn(page);
  await emptyOtherPanels(page);
  const pages: number[] = [];
  const unexpected: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS'
      && /\/api\/personal-content\/history\/completed/.test(new URL(request.url()).pathname))
      unexpected.push(request.method());
  });
  await page.route('**/api/personal-content/history/completed*', route => {
    const url = new URL(route.request().url());
    const pageIndex = Number(url.searchParams.get('page'));
    pages.push(pageIndex);
    const items = pageIndex === 1 ? completed.slice(0, 2) : completed.slice(2);
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({ items, page: pageIndex, pageSize: 2, hasMore: pageIndex === 1 }) });
  });

  await page.goto('./#/refuge/journal');
  const entries = page.getByTestId('refuge-journal-completed-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText(ownerGrantA.slice(0, 8));
  await expect(entries.nth(1)).toContainText(ownerGrantB.slice(0, 8));
  await expect(entries.first()).toContainText('Sfida di rune completata');
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(2)).toContainText(ownerGrantC.slice(0, 8));
  await expect(page.getByTestId('refuge-journal-completed-more')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-completed')).not.toContainText('rewardKey');
  expect(pages).toContain(1);
  expect(pages).toContain(2);
  expect(unexpected).toEqual([]);
});

test('history 503 leaves item and available portal sections usable; retry only re-reads history', async ({ page }) => {
  await signIn(page);
  await emptyOtherPanels(page);
  let fail = true;
  let calls = 0;
  await page.route('**/api/personal-content/history/completed*', route => {
    calls++;
    return fail ? route.fulfill({ status: 503, headers: corsHeaders }) :
      route.fulfill({
        headers: corsHeaders, contentType: 'application/json',
        body: JSON.stringify({ items: [completed[0]], page: 1, pageSize: 20, hasMore: false }),
      });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();
  const before = calls;
  fail = false;
  await page.getByTestId('refuge-journal-completed-retry').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await expect(page.getByTestId('refuge-journal-completed-error')).toHaveCount(0);
  expect(calls).toBeGreaterThan(before);
});

test('refresh all invalidates the completed timeline before the next server response', async ({ page }) => {
  await signIn(page);
  await emptyOtherPanels(page);
  let refresh = false;
  let release!: () => void;
  const deferred = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/personal-content/history/completed*', async route => {
    if (refresh) await deferred;
    return route.fulfill({
      headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({
        items: refresh ? [] : [completed[0]], page: 1, pageSize: 20, hasMore: false,
      }),
    });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  refresh = true;
  await page.getByTestId('refuge-journal-refresh-all').click();
  await expect(page.getByTestId('refuge-journal-completed-loading')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  release();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
});

test('English dark mobile 320px verified timeline supports keyboard pagination without Phaser', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'en');
  await emptyOtherPanels(page);
  const unwanted: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/assets\/GamePage-[^/]+\.js/.test(path) ||
      (request.method() !== 'GET' && request.method() !== 'OPTIONS'
        && /\/api\/personal-content\/history/.test(path))) {
      unwanted.push(path);
    }
  });
  await page.route('**/api/personal-content/history/completed*', route => {
    const index = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({
      items: index === 1 ? [completed[0]] : [completed[1]],
      page: index, pageSize: 1, hasMore: index === 1,
    }) });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('heading', { name: 'Verified completed portals' })).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-disclaimer')).toContainText('audit events');
  await page.getByTestId('refuge-journal-completed-more').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(unwanted).toEqual([]);
});
