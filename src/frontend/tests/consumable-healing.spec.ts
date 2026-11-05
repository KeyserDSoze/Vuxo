import { expect, test, type Page, type Route } from '@playwright/test';

const grantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const groveSeed = 'item.grove_seed.v1';
const cors = { 'Access-Control-Allow-Origin': '*' };

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  const expiresAtUtc = new Date(Date.now() + 3_600_000).toISOString();
  await page.addInitScript(({ expiresAtUtc, language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'consumable-test-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user',
      JSON.stringify({ id: 'player-a', displayName: 'Healer', email: null }));
  }, { expiresAtUtc, language });
}

function json(route: Route, value: unknown, status = 200) {
  return route.fulfill({
    contentType: 'application/json', status, headers: cors, body: JSON.stringify(value),
  });
}

async function mockInventory(page: Page, isSpent: () => boolean, isEquipped = false) {
  await page.route('**/api/inventory', route => json(route, [{
    grantId, itemKey: groveSeed, consumed: isSpent(), quantity: 1,
    awardedAtUtc: '2026-11-05T08:00:00Z'
  }]));
  await page.route('**/api/inventory/stacks', route => json(route,
    isSpent() ? [] : [{
      itemKey: groveSeed, quantity: 1,
      equippedQuantity: isEquipped ? 1 : 0,
      availableGrantIds: isEquipped ? [] : [grantId],
    }]
  ));
  await page.route('**/api/equipment', route => json(route, {
    items: isEquipped ? [{
      slot: 'charm', grantId, itemKey: groveSeed,
      equippedAtUtc: '2026-11-05T08:01:00Z'
    }] : [], stats: null, ruleVersion: 'equipment-v1',
  }));
}

test('consuming a real award heals from server and removes usable stock without deleting history', async ({ page }) => {
  await signIn(page);
  let spent = false;
  await mockInventory(page, () => spent);
  const keys: string[] = [];
  await page.route('**/api/characters/me/heal/**', route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['authorization']).toBe('Bearer consumable-test-token');
    const key = route.request().headers()['idempotency-key'];
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    keys.push(key);
    spent = true;
    return json(route, {
      grantId, idempotencyKey: key,
      previousHealth: 5, currentHealth: 15,
      maxHealth: 20, restoredHealth: 10,
      consumedAtUtc: '2026-11-05T08:02:00Z', replayed: false,
    });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-heal')).toHaveText('Usa per curarti (+10 HP)');
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-success')).toContainText('+10 HP (15/20)');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toContainText('Consumato');
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  expect(keys).toHaveLength(1);
});

test('a failed network response is retried with the same UUID in English mobile UI', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'en');
  let spent = false;
  await mockInventory(page, () => spent);
  const keys: string[] = [];
  await page.route('**/api/characters/me/heal/**', route => {
    const key = route.request().headers()['idempotency-key'];
    keys.push(key);
    if (keys.length === 1) return json(route, { code: 'heal_request_failed' }, 503);
    spent = true;
    return json(route, {
      grantId, idempotencyKey: key,
      previousHealth: 5, currentHealth: 15,
      maxHealth: 20, restoredHealth: 10,
      consumedAtUtc: '2026-11-05T08:02:00Z', replayed: true,
    });
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-error')).toContainText('Retry safely');
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-success')).toContainText('Item consumed: +10 HP');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )).toBe(true);
});

test('equipped Grove Seed does not offer consumption', async ({ page }) => {
  await signIn(page);
  await mockInventory(page, () => false, true);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-stack')).toContainText('Equipaggiate: 1');
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  await expect(page.getByTestId('inventory-unequip')).toBeVisible();
});

test('a guest cannot consume inventory items or call healing API', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  let requests = 0;
  await page.route('**/api/characters/me/heal/**', route => {
    requests++;
    return json(route, { code: 'unauthorized' }, 401);
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  expect(requests).toBe(0);
});
