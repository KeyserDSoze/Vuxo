import { expect, test, type Page } from '@playwright/test';

const shard = '11111111-1111-4111-8111-111111111111';
const seed = '22222222-2222-4222-8222-222222222222';
const pearl = '33333333-3333-4333-8333-333333333333';

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.theme', 'system');
    localStorage.setItem('vuxo.accessToken', 'inspection-owner-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'inspection-owner', displayName: 'Inspector', email: null,
    }));
  }, { language });
}

async function mockInventory(page: Page) {
  const awards = [
    { grantId: shard, itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-03T10:00:00Z' },
    { grantId: seed, itemKey: 'item.grove_seed.v1', quantity: 3, awardedAtUtc: '2026-11-02T10:00:00Z' },
    { grantId: pearl, itemKey: 'item.tidal_pearl.v1', quantity: 2, awardedAtUtc: '2026-11-01T10:00:00Z' },
  ];
  const stacks = [
    { itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 1, availableGrantIds: [] },
    { itemKey: 'item.grove_seed.v1', quantity: 3, equippedQuantity: 0, availableGrantIds: [seed] },
    { itemKey: 'item.tidal_pearl.v1', quantity: 2, equippedQuantity: 0, availableGrantIds: [pearl] },
  ];
  const loadout = {
    items: [{ slot: 'relic', grantId: shard, itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-03T11:00:00Z' }],
    stats: null, ruleVersion: 'equipment-v1',
  };
  await page.route('**/api/inventory', route => route.fulfill({ json: awards }));
  await page.route('**/api/inventory/stacks', route => route.fulfill({ json: stacks }));
  await page.route('**/api/equipment', route => route.fulfill({ json: loadout }));
}

test('owner has responsive item cards and a read-only server-backed detail dialog', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && /\/api\/(inventory|equipment)/.test(new URL(request.url()).pathname)) {
      mutations.push(request.url());
    }
  });
  await page.goto('./#/inventory');

  await expect(page.getByTestId('inventory-stack-grid')).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-inspect')).toHaveCount(3);
  const card = page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' });
  await card.getByTestId('inventory-inspect').click();
  const dialog = page.getByRole('dialog', { name: 'Ispezione oggetto' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Seme del bosco');
  await expect(page.getByTestId('inventory-inspection-key')).toHaveText('item.grove_seed.v1');
  await expect(dialog).toContainText('Copie possedute: 3');
  await expect(dialog).toContainText('Equipaggiate: 0');
  expect(mutations).toEqual([]);

  await dialog.getByRole('button', { name: 'Chiudi ispezione' }).click();
  await expect(dialog).toHaveCount(0);
  await card.getByTestId('inventory-inspect').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('search and sorting keep the visual card count consistent with the authoritative browse model', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await page.getByTestId('inventory-browse-search').fill('PERLA');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Perla delle maree');
  await page.getByTestId('inventory-inspect').click();
  await expect(page.getByTestId('inventory-inspection-key')).toHaveText('item.tidal_pearl.v1');
  await page.keyboard.press('Escape');
  await page.getByTestId('inventory-browse-clear').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
});

test('inventory invalidation dismisses inspection instead of displaying a stale owner snapshot', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  const card = page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' });
  await card.getByTestId('inventory-inspect').click();
  await expect(page.getByRole('dialog', { name: 'Ispezione oggetto' })).toBeVisible();
  await page.getByTestId('inventory-loadout-refresh').click();
  await expect(page.getByRole('dialog', { name: 'Ispezione oggetto' })).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
  });
  await page.reload();
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-inspect')).toHaveCount(0);
});

test('English inspection and focus stay usable on 320px dark mobile', async ({ page }) => {
  await signIn(page, 'en');
  await mockInventory(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/inventory');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  const button = page.getByTestId('inventory-stack').filter({ hasText: 'Grove seed' }).getByTestId('inventory-inspect');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Item inspection' })).toBeVisible();
  await expect(page.getByTestId('inventory-inspection-key')).toHaveText('item.grove_seed.v1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});

test('guests never get item inspect controls or send private inventory requests', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => {
    if (/\/api\/(inventory|equipment)/.test(new URL(request.url()).pathname)) calls.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-inspect')).toHaveCount(0);
  expect(calls).toEqual([]);
});
