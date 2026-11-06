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
