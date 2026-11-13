import { expect, test, type Page } from '@playwright/test';
import { seedOwnerSession } from './support/vuxoFixtures';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const completed = (index: number) => ({
  grantId: ids[index], contentKey: 'portal.memory.grove',
  ruleVersion: 'personal-content-v1',
  grantedAtUtc: '2026-11-01T10:00:00Z',
  completedAtUtc: '2026-11-09T10:00:00Z',
  rewardItemKey: index === 0 ? 'item.grove_seed.v1' : null,
});
const outcome = (index: number, kind: string) => ({
  eventId: ids[index], grantId: ids[index], contentKey: 'portal.memory.grove',
  ruleVersion: 'personal-content-v1',
  occurredAtUtc: '2026-11-09T10:00:00Z',
  kind, rewardItemKey: null,
});

async function signIn(page: Page, language: 'it' | 'en') {
  await seedOwnerSession(page, {
    token: 'cursor-owner', userId: 'cursor-owner', displayName: 'Explorer', language,
  });
  await page.route('**/api/inventory', route => route.fulfill({
    headers, contentType: 'application/json', body: '[]',
  }));
  await page.route('**/api/personal-content', route => route.fulfill({
    headers, contentType: 'application/json', body: '[]',
  }));
}

test('Italian completed history uses keyset after and does not repeat a completion when a newer one arrives', async ({ page }) => {
  await signIn(page, 'it');
  const requests: string[] = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const url = new URL(route.request().url());
    const after = url.searchParams.get('after');
    requests.push(url.search);
    if (after === 'seek-one') {
      return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({
        items: [completed(1)], page: 2, pageSize: 1, hasMore: false, nextCursor: null,
      }) });
    }
    // A new completion is inserted after the first response. Without the
    // cursor an offset query would return the first entry again.
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({
      items: requests.length === 1 ? [completed(0)] : [completed(0)],
      page: 1, pageSize: 1, hasMore: true, nextCursor: 'seek-one',
    }) });
  });
  await page.goto('./#/refuge/journal');
  const entries = page.getByTestId('refuge-journal-completed-entry');
  await expect(page.getByTestId('refuge-journal-completed')).toHaveCount(0);
  expect(requests).toEqual([]);
  await page.getByTestId('refuge-journal-show-completed').click();
  await expect(entries).toHaveCount(1);
  await expect(page.getByTestId('refuge-journal-seek-hint'))
    .toContainText('Le pagine successive restano in ordine');
  await expect(entries.first().getByTestId('refuge-journal-verified-reward'))
    .toContainText('Seme del bosco');
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(1)).toContainText(ids[1].slice(0, 8));
  await expect(page.getByTestId('refuge-journal-completed-more')).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(new URLSearchParams(requests[1]).get('after')).toBe('seek-one');
  expect(new URLSearchParams(requests[1]).get('page')).toBe('2');
});

test('English dark mobile outcome history carries cursor and clears it on mode change, refresh and remount', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'en');
  const requests: { mode: string; after: string | null; page: string | null }[] = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const url = new URL(route.request().url());
    requests.push({ mode: 'completed', after: url.searchParams.get('after'),
      page: url.searchParams.get('page') });
    return route.fulfill({ headers, contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }),
    });
  });
  await page.route('**/api/personal-content/history/outcomes*', route => {
    const url = new URL(route.request().url());
    const after = url.searchParams.get('after');
    requests.push({ mode: 'outcomes', after, page: url.searchParams.get('page') });
    return route.fulfill({ headers, contentType: 'application/json',
      body: JSON.stringify(after === 'outcomes-seek'
        ? { items: [outcome(1, 'guardian_retreat')], page: 2,
            pageSize: 1, hasMore: false, nextCursor: null }
        : { items: [outcome(0, 'guardian_victory')], page: 1,
            pageSize: 1, hasMore: true, nextCursor: 'outcomes-seek' }),
    });
  });
  const gameAssets: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/assets\/GamePage-[^/]+\.js/.test(path)) gameAssets.push(path);
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('refuge-journal-show-completed').click();
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await expect(page.getByTestId('refuge-journal-seek-hint'))
    .toContainText('Older pages stay in order');
  await page.getByTestId('refuge-journal-completed-more').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await expect(page.getByTestId('refuge-journal-completed-entry').nth(1))
    .toContainText('Retreat from the Guardian');
  expect(requests.filter(r => r.mode === 'outcomes').map(r => r.after))
    .toEqual([null, 'outcomes-seek']);

  await page.getByTestId('refuge-journal-mode-completed').click();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  expect(requests.filter(r => r.mode === 'outcomes').at(-1)?.after).toBeNull();
  await page.getByTestId('refuge-journal-refresh-all').click();
  await expect(page.getByTestId('refuge-journal-mode-completed'))
    .toHaveAttribute('aria-pressed', 'true');
  expect(requests.filter(r => r.mode === 'completed').at(-1)?.after).toBeNull();

  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(gameAssets).toEqual([]);
});

test('older API page responses without a cursor still support loading page two', async ({ page }) => {
  await signIn(page, 'it');
  const pages: string[] = [];
  await page.route('**/api/personal-content/history/completed*', route => {
    const url = new URL(route.request().url());
    pages.push(url.search);
    const next = url.searchParams.get('page') === '2';
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({
      items: [completed(next ? 1 : 0)], page: next ? 2 : 1,
      pageSize: 1, hasMore: !next,
    }) });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-show-completed').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  expect(pages).toHaveLength(2);
  expect(new URLSearchParams(pages[1]).get('after')).toBeNull();
  expect(new URLSearchParams(pages[1]).get('page')).toBe('2');
});
