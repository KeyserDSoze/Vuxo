import { expect, test, type Page } from '@playwright/test';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const solved = { grantId: a, contentKey: 'portal.memory.grove',
  ruleVersion: 'personal-content-v1', grantedAtUtc: '2026-11-01T10:00:00Z',
  completedAtUtc: '2026-11-05T10:00:00Z', rewardItemKey: 'item.grove_seed.v1' };
const outcome = { eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', grantId: a,
  contentKey: solved.contentKey, kind: 'sequence_completed',
  ruleVersion: solved.ruleVersion, occurredAtUtc: solved.completedAtUtc,
  rewardItemKey: solved.rewardItemKey };

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'reward-owner-a');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'reward-owner-a', displayName: 'Explorer', email: null,
    }));
  }, { language });
}
async function otherSections(page: Page) {
  await page.route('**/api/inventory', route => route.fulfill({
    headers: cors, contentType: 'application/json', body: '[]',
  }));
  await page.route('**/api/personal-content', route => route.fulfill({
    headers: cors, contentType: 'application/json', body: '[]',
  }));
}

test('only causally verified completion receives an item label', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  await page.route('**/api/personal-content/history/completed*', route => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ items: [solved, { ...solved, grantId: b, rewardItemKey: null }],
      page: 1, pageSize: 20, hasMore: false }),
  }));
  await page.goto('./#/refuge/journal');
  const entries = page.getByTestId('refuge-journal-completed-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0).getByTestId('refuge-journal-verified-reward'))
    .toContainText('Ricompensa verificata: Seme del bosco');
  await expect(entries.nth(1).getByTestId('refuge-journal-verified-reward')).toHaveCount(0);
});

test('a same-grant mistake or Guardian victory does not inherit the rune reward', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  const methods: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/history/') &&
      !['GET', 'OPTIONS'].includes(request.method())) methods.push(request.method());
  });
  await page.route('**/api/personal-content/history/completed*', route => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }),
  }));
  await page.route('**/api/personal-content/history/outcomes*', route => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ items: [
      outcome,
      { ...outcome, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        kind: 'sequence_first_mistake', rewardItemKey: null },
      { ...outcome, eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        kind: 'guardian_victory', rewardItemKey: null },
    ], page: 1, pageSize: 20, hasMore: false }),
  }));
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  const entries = page.getByTestId('refuge-journal-completed-entry');
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0).getByTestId('refuge-journal-verified-reward'))
    .toContainText('Seme del bosco');
  await expect(entries.nth(1).getByTestId('refuge-journal-verified-reward')).toHaveCount(0);
  await expect(entries.nth(2).getByTestId('refuge-journal-verified-reward')).toHaveCount(0);
  expect(methods).toEqual([]);
});

test('verified award displays on later page, while earlier page has none', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  const pages: number[] = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    pages.push(current);
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: [current === 1
        ? { ...solved, grantId: b, rewardItemKey: null } : solved],
        page: current, pageSize: 1, hasMore: current === 1 }),
    });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await expect(page.getByTestId('refuge-journal-verified-reward')).toHaveCount(0);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-verified-reward')).toHaveCount(1);
  expect(pages).toContain(1);
  expect(pages).toContain(2);
});

test('unknown reward remains unnamed in English dark mobile; owner switch clears the previous reward', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'en');
  await otherSections(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/personal-content/history/completed*', async route => {
    const other = route.request().headers()['authorization'] === 'Bearer reward-owner-b';
    if (other) await waiting;
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: other ? [] :
        [{ ...solved, rewardItemKey: 'item.unknown.future' }],
        page: 1, pageSize: 20, hasMore: false }),
    });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByTestId('refuge-journal-verified-reward'))
    .toContainText('Verified reward: Item not yet cataloged');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'reward-owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'owner-b', displayName: 'Other' }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-journal-verified-reward')).toHaveCount(0);
  release();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
});

test('duplicate completion after an off-device insert fails closed and retries from page one', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  let stalePageTwo = true;
  const reads: number[] = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const requested = Number(new URL(route.request().url()).searchParams.get('page'));
    reads.push(requested);
    const items = requested === 1
      ? [solved]
      : stalePageTwo
        ? [{ ...solved, grantId: a.toUpperCase() }]
        : [{ ...solved, grantId: b, completedAtUtc: '2026-11-04T10:00:00Z',
          rewardItemKey: null }];
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items, page: requested, pageSize: 20,
        hasMore: requested === 1 }),
    });
  });

  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-completed-more')).toHaveCount(0);

  stalePageTwo = false;
  await page.getByTestId('refuge-journal-completed-retry').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-completed-error')).toHaveCount(0);
  expect(reads).toEqual([1, 2, 1, 2]);
});

test('outcome history detects a newer page-two event at 100ns precision', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  const earlier = { ...outcome, occurredAtUtc: '2026-11-06T12:00:00.1234567Z' };
  const newer = { ...outcome, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    occurredAtUtc: '2026-11-06T12:00:00.1234568Z' };
  await page.route('**/api/personal-content/history/completed*', route =>
    route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }) }));
  await page.route('**/api/personal-content/history/outcomes*', route => {
    const requested = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: requested === 1 ? [earlier] : [newer],
        page: requested, pageSize: 20, hasMore: requested === 1 }) });
  });

  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
});

test('Journal sends the continuation cursor so a concurrent new head cannot duplicate a completion', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  // An actual 24-byte portal cursor: UTC ticks + public grant GUID, base64url.
  const cursor = 'CN87I43fEAARERERERERQYERERERERER';
  const pageRequests: Array<{ page: number; cursor: string | null }> = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const url = new URL(route.request().url());
    const index = Number(url.searchParams.get('page'));
    const supplied = url.searchParams.get('cursor');
    pageRequests.push({ page: index, cursor: supplied });
    const items = index === 1 ? [solved] : supplied === cursor
      ? [{ ...solved, grantId: b, completedAtUtc: '2026-11-04T10:00:00Z',
        rewardItemKey: null }] : [solved]; // offset drift would repeat page 1
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items, page: index, pageSize: 20,
        hasMore: index === 1, nextCursor: index === 1 ? cursor : null }) });
  });

  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  // A second device adds a *newer* completion before page 2 is requested.
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-completed-error')).toHaveCount(0);
  expect(pageRequests).toEqual([{ page: 1, cursor: null }, { page: 2, cursor }]);
});

test('keyset pagination continues the owner outcome timeline across two event families', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  const cursor = 'CN87I43fEACqqqqqqqqqSoqqqqqqqqqq';
  const requests: string[] = [];
  await page.route('**/api/personal-content/history/completed*', route => route.fulfill({
    headers: cors, contentType: 'application/json',
    body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }),
  }));
  await page.route('**/api/personal-content/history/outcomes*', route => {
    const url = new URL(route.request().url());
    const index = Number(url.searchParams.get('page'));
    requests.push(url.searchParams.get('cursor') ?? '(none)');
    const older = { ...outcome, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'guardian_retreat', rewardItemKey: null,
      occurredAtUtc: '2026-11-04T10:00:00Z' };
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: index === 1 ? [outcome] :
          url.searchParams.get('cursor') === cursor ? [older] : [outcome],
        page: index, pageSize: 20, hasMore: index === 1,
        nextCursor: index === 1 ? cursor : null }) });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-completed-error')).toHaveCount(0);
  expect(requests).toEqual(['(none)', cursor]);
});

test('the Journal rejects an invalid continuation token before it can request another page', async ({ page }) => {
  await signIn(page);
  await otherSections(page);
  let pageTwoGets = 0;
  await page.route('**/api/personal-content/history/completed*', route => {
    const index = Number(new URL(route.request().url()).searchParams.get('page'));
    if (index > 1) pageTwoGets++;
    return route.fulfill({ headers: cors, contentType: 'application/json',
      body: JSON.stringify({ items: [solved], page: index, pageSize: 20,
        hasMore: true, nextCursor: '!invalid!' }) });
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-completed-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-completed-more')).toHaveCount(0);
  expect(pageTwoGets).toBe(0);
});
