import { expect, test, type Page } from '@playwright/test';
import { seedOwnerSession } from './support/vuxoFixtures';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const base = {
  grantId: '11111111-1111-4111-8111-111111111111',
  contentKey: 'portal.memory.grove',
  ruleVersion: 'personal-content-v1',
  occurredAtUtc: '2026-11-05T14:00:00Z',
};
const events = [
  { ...base, eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'sequence_completed' },
  { ...base, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    kind: 'sequence_first_mistake', ruleVersion: 'portal-mistake-damage-v1' },
  { ...base, eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    kind: 'guardian_victory', ruleVersion: 'portal-guardian-showdown-v2' },
  { ...base, eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    kind: 'guardian_retreat', ruleVersion: 'portal-guardian-showdown-v2' },
];

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await seedOwnerSession(page, {
    token: 'outcomes-owner-a', userId: 'owner-a', displayName: 'Owner A', language,
  });
}

async function baseFixtures(page: Page) {
  for (const suffix of ['inventory', 'personal-content']) {
    await page.route('**/api/' + suffix, route => route.fulfill({
      headers: corsHeaders, contentType: 'application/json', body: '[]',
    }));
  }
  await page.route('**/api/personal-content/history/completed*', route => route.fulfill({
    headers: corsHeaders, contentType: 'application/json',
    body: JSON.stringify({ items: [], page: 1, pageSize: 20, hasMore: false }),
  }));
}

test('anonymous visitors cannot fetch outcome history', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/history/outcomes'))
      requests.push(request.url());
  });
  await page.goto('./#/refuge/journal');
  await expect(page.getByTestId('refuge-journal-auth-required')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-mode-outcomes')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('all verified outcomes display distinct meanings, with no client-created victories', async ({ page }) => {
  await signIn(page);
  await baseFixtures(page);
  const methods: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/history/outcomes') &&
      !['GET', 'OPTIONS'].includes(request.method())) methods.push(request.method());
  });
  await page.route('**/api/personal-content/history/outcomes*', route =>
    route.fulfill({
      headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({ items: events, page: 1, pageSize: 20, hasMore: false }),
    }),
  );
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-show-completed').click();
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByRole('heading', { name: 'Esiti verificati dei portali' })).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(4);
  await expect(page.locator('[data-testid="refuge-journal-completed-entry"][data-kind="sequence_completed"]'))
    .toContainText('Sequenza di rune completata');
  await expect(page.locator('[data-testid="refuge-journal-completed-entry"][data-kind="sequence_first_mistake"]'))
    .toContainText('Primo errore di rune registrato');
  await expect(page.locator('[data-testid="refuge-journal-completed-entry"][data-kind="guardian_victory"]'))
    .toContainText('Vittoria contro il Guardiano');
  await expect(page.locator('[data-testid="refuge-journal-completed-entry"][data-kind="guardian_retreat"]'))
    .toContainText('Ritirata dal Guardiano');
  await expect(page.getByTestId('refuge-journal-completed-disclaimer'))
    .toContainText('non conta tutti i tentativi sbagliati');
  expect(methods).toEqual([]);
});

test('outcome pages stay ordered, history errors can retry, and returning to completed resets mode', async ({ page }) => {
  await signIn(page);
  await baseFixtures(page);
  let fail = true;
  const pages: number[] = [];
  await page.route('**/api/personal-content/history/outcomes*', route => {
    const pg = Number(new URL(route.request().url()).searchParams.get('page'));
    pages.push(pg);
    if (fail) return route.fulfill({ status: 503, headers: corsHeaders });
    return route.fulfill({
      headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({ items: pg === 1 ? events.slice(0, 2) : events.slice(2),
        page: pg, pageSize: 2, hasMore: pg === 1 }),
    });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-show-completed').click();
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-error')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toHaveCount(0);
  fail = false;
  await page.getByTestId('refuge-journal-completed-retry').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(2);
  await page.getByTestId('refuge-journal-completed-more').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(4);
  expect(pages).toContain(1);
  expect(pages).toContain(2);
  await page.getByTestId('refuge-journal-mode-completed').click();
  await expect(page.getByRole('heading', { name: 'Portali completati e verificati' })).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
});

test('global refresh and account change invalidate old outcomes before the next response', async ({ page }) => {
  await signIn(page);
  await baseFixtures(page);
  let ownerTwo = false;
  await page.route('**/api/personal-content/history/outcomes*', route => {
    return route.fulfill({
      headers: corsHeaders, contentType: 'application/json',
      body: JSON.stringify({
        items: ownerTwo ? [] : events.slice(0, 1),
        page: 1, pageSize: 20, hasMore: false,
      }),
    });
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-show-completed').click();
  await page.getByTestId('refuge-journal-mode-outcomes').click();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(1);
  await page.getByTestId('refuge-journal-refresh-all').click();
  // A global refresh remounts history with the default verified-completions mode.
  await expect(page.getByTestId('refuge-journal-mode-completed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  ownerTwo = true;
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'outcomes-owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'owner-b', displayName: 'Owner B' }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  // The parent remounts on token changes and closes all personal history.
  await expect(page.getByTestId('refuge-journal-completed')).toHaveCount(0);
  await page.getByTestId('refuge-journal-show-completed').click();
  await expect(page.getByTestId('refuge-journal-mode-completed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('refuge-journal-completed-entry')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
});

test('English dark 320px keyboard mode displays retreat separately without Phaser', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'en');
  await baseFixtures(page);
  await page.route('**/api/personal-content/history/outcomes*', route => route.fulfill({
    headers: corsHeaders, contentType: 'application/json',
    body: JSON.stringify({ items: [events[3]], page: 1, pageSize: 20, hasMore: false }),
  }));
  const game: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js/.test(new URL(request.url()).pathname)) game.push(request.url());
  });
  await page.goto('./#/refuge/journal');
  await page.getByTestId('refuge-journal-show-completed').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('refuge-journal-mode-outcomes').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Verified portal outcomes' })).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-entry')).toContainText('Retreat from the Guardian');
  await expect(page.getByTestId('refuge-journal-completed-disclaimer')).toContainText('retreat is not a failed rune sequence');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(game).toEqual([]);
});
