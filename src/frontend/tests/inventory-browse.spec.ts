import { expect, test, type Page } from '@playwright/test';

const shard = '11111111-1111-4111-8111-111111111111';
const seed = '22222222-2222-4222-8222-222222222222';
const pearl = '33333333-3333-4333-8333-333333333333';
const usedSeed = '44444444-4444-4444-8444-444444444444';

const awards = [
  { grantId: shard, itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-03T10:00:00Z' },
  { grantId: seed, itemKey: 'item.grove_seed.v1', quantity: 3, awardedAtUtc: '2026-11-02T10:00:00Z' },
  { grantId: pearl, itemKey: 'item.tidal_pearl.v1', quantity: 2, awardedAtUtc: '2026-11-01T10:00:00Z' },
  { grantId: usedSeed, itemKey: 'item.grove_seed.v1', quantity: 1, consumed: true, awardedAtUtc: '2026-11-01T08:00:00Z' },
];
const stacks = [
  { itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 1, availableGrantIds: [] },
  { itemKey: 'item.grove_seed.v1', quantity: 3, equippedQuantity: 0, availableGrantIds: [seed] },
  { itemKey: 'item.tidal_pearl.v1', quantity: 2, equippedQuantity: 0, availableGrantIds: [pearl] },
];
const equipment = {
  items: [{ slot: 'relic', grantId: shard, itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-03T11:00:00Z' }],
  stats: null,
  ruleVersion: 'equipment-v1',
};

async function signIn(page: Page, id = 'owner-a', language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ id, language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'test-token-' + id);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id, displayName: id, email: null }));
  }, { id, language });
}

async function mockInventory(page: Page) {
  await page.route('**/api/inventory', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(awards),
  }));
  await page.route('**/api/inventory/stacks', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(stacks),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(equipment),
  }));
}

test('browse controls require authentication and issue no anonymous owner requests', async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('vuxo.language', 'it'); });
  const calls: string[] = [];
  page.on('request', request => {
    if (/\/api\/(inventory|equipment)/.test(new URL(request.url()).pathname)) calls.push(request.url());
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('Italian search matches localized names without case or accent sensitivity', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);

  await page.getByTestId('inventory-browse-search').fill('SÈmE');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Seme del bosco');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await expect(page.getByTestId('inventory-browse-results')).toContainText('3 su 7');

  await page.getByTestId('inventory-browse-search').fill('item.tidal_pearl.v1');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toContainText('Perla delle maree');
});

test('equipped and available filters use server grant IDs and never include consumed awards', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();

  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Equipaggiati' }).click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toContainText('Frammento di runa');

  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Disponibili' }).click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2);
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await expect(page.getByTestId('inventory-items')).not.toContainText('Consumato');
  await expect(page.getByTestId('inventory-stacks')).not.toContainText('Frammento di runa');
});

test('quantity sort applies to stacks and awards, clear restores all entries', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await page.getByTestId('inventory-browse-sort').click();
  await page.getByRole('option', { name: 'Quantità (decrescente)' }).click();
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Seme del bosco');
  await expect(page.getByTestId('inventory-item').first()).toContainText('Seme del bosco');

  await page.getByTestId('inventory-browse-search').fill('non-existing');
  await expect(page.getByTestId('inventory-browse-empty')).toContainText('Nessun oggetto');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  await expect(page.getByTestId('inventory-empty')).toHaveCount(0);

  await page.getByTestId('inventory-browse-clear').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-browse-empty')).toHaveCount(0);
});

test('search and filter do not make gameplay API requests or mutate authoritative data', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  const unexpected: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if ((/\/api\/(inventory|equipment)(\/|$)/.test(pathname) && method !== 'OPTIONS')
        || (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method))) {
      unexpected.push(method + ':' + pathname);
    }
  });
  await page.getByTestId('inventory-browse-search').fill('runa');
  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Tutti' }).click();
  await page.getByTestId('inventory-browse-sort').click();
  await page.getByRole('option', { name: 'Nome' }).click();
  await page.getByTestId('inventory-browse-clear').click();
  expect(unexpected).toEqual([]);
});

test('English dark 320px mobile layout re-sorts translated names without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find your items' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Grove Seed');
  await page.getByTestId('inventory-browse-search').fill('tidal');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const pageWidth = root.clientWidth;
    const overflow = root.scrollWidth - pageWidth;
    if (overflow <= 1) return 'PASS';
    const suspects = [...document.querySelectorAll<HTMLElement>('body *')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        testId: element.getAttribute('data-testid'),
        tag: element.tagName.toLowerCase(),
        css: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
        left: Math.round(rect.left), right: Math.round(rect.right),
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      };
    }).filter(item => item.right > pageWidth + 1 || item.left < -1 ||
      item.scrollWidth > item.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 14);
    return JSON.stringify({
      overflow, pageWidth, rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth, suspects,
    });
  })).toBe('PASS');
});

test('owner switch remounts inventory so previous items and filters are not flashed', async ({ page }) => {
  await signIn(page);
  let resolveSecond!: () => void;
  const secondPending = new Promise<void>(resolve => { resolveSecond = resolve; });
  await page.route('**/api/inventory', async route => {
    if (route.request().headers()['authorization'] === 'Bearer test-token-owner-b') await secondPending;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b' ? [] : awards),
    });
  });
  await page.route('**/api/inventory/stacks', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b' ? [] : stacks),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b'
      ? { ...equipment, items: [] } : equipment),
  }));
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await page.getByTestId('inventory-browse-search').fill('Seme');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);

  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'test-token-owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'owner-b', displayName: 'Other', email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
  resolveSecond();
  await expect(page.getByTestId('inventory-empty')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
});
