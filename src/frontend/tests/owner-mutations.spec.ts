import { expect, test, type Page, type Route } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const grant = '11111111-1111-4111-8111-111111111111';
const otherGrant = '22222222-2222-4222-8222-222222222222';
const itemKey = 'item.grove_seed.v1';
const runeKey = 'item.rune_shard.v1';
const at = '2026-11-05T10:00:00Z';
const json = (route: Route, data: unknown) => route.fulfill({
  headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(data),
});

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'mutation-owner-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'mutation-owner', displayName: 'Explorer', email: null,
    }));
  });
}
async function encounterIdle(page: Page) {
  await page.route('**/api/characters/me/encounter', route =>
    json(route, { active: false, portalGrantId: null, expiresAtUtc: null }));
}
function restReceipt(key: string) {
  return { idempotencyKey: key, previousHealth: 7, currentHealth: 12,
    maxHealth: 20, restoredHealth: 5, restedAtUtc: at,
    nextRestAtUtc: '2026-11-05T10:30:00Z', replayed: false };
}
function healingReceipt(key: string) {
  return { grantId: grant, idempotencyKey: key, previousHealth: 5,
    currentHealth: 15, maxHealth: 20, restoredHealth: 10,
    consumedAtUtc: at, replayed: false };
}

test('rest rejects a successful HTTP response with the wrong replay key, then safely retries the same key', async ({ page }) => {
  await signIn(page);
  await encounterIdle(page);
  await page.route('**/api/equipment', route =>
    json(route, { items: [], stats: null, ruleVersion: 'equipment-v1' }));
  await page.route('**/api/characters/me/health', route =>
    json(route, { name: 'Explorer', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1' }));
  const requested: string[] = [];
  await page.route('**/api/characters/me/rest', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: corsHeaders, status: 204 });
    expect(route.request().method()).toBe('POST');
    const key = route.request().headers()['idempotency-key'] ?? '';
    requested.push(key);
    return json(route, restReceipt(requested.length === 1 ? otherGrant : key));
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-rest-button')).toBeEnabled();
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-error')).toBeVisible();
  await expect(page.getByTestId('refuge-health-count')).toContainText('7 / 20');
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-success')).toBeVisible();
  await expect(page.getByTestId('refuge-health-count')).toContainText('12 / 20');
  expect(requested).toHaveLength(2);
  expect(requested[0]).toBe(requested[1]);
});

test('a forged successful item-heal receipt cannot consume stock in the UI; retry retains UUID', async ({ page }) => {
  await signIn(page);
  await encounterIdle(page);
  let spent = false;
  await page.route('**/api/inventory', route => json(route, [{
    grantId: grant, itemKey, quantity: 1, awardedAtUtc: at, consumed: spent,
  }]));
  await page.route('**/api/inventory/stacks', route => json(route, spent ? [] : [{
    itemKey, quantity: 1, equippedQuantity: 0, availableGrantIds: [grant],
  }]));
  await page.route('**/api/equipment', route =>
    json(route, { items: [], stats: null, ruleVersion: 'equipment-v1' }));
  const keys: string[] = [];
  await page.route('**/api/characters/me/heal/**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: corsHeaders, status: 204 });
    expect(route.request().method()).toBe('POST');
    const key = route.request().headers()['idempotency-key'] ?? '';
    keys.push(key);
    if (keys.length === 1) return json(route, { ...healingReceipt(key), grantId: otherGrant });
    spent = true;
    return json(route, { ...healingReceipt(key), replayed: true });
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-error')).toBeVisible();
  await expect(page.getByTestId('inventory-heal-success')).toHaveCount(0);
  await expect(page.getByTestId('inventory-heal')).toBeVisible();
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-success')).toBeVisible();
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('equip HTTP 200 that omits the requested grant hides loadout until a safe refresh', async ({ page }) => {
  await signIn(page);
  let equipped = false;
  let mutations = 0;
  const item = { slot: 'relic', grantId: grant, itemKey: runeKey, equippedAtUtc: at };
  const snapshot = () => ({ items: equipped ? [item] : [], stats: null, ruleVersion: 'equipment-v1' });
  await page.route('**/api/inventory', route =>
    json(route, [{ grantId: grant, itemKey: runeKey, quantity: 1, awardedAtUtc: at }]));
  await page.route('**/api/inventory/stacks', route => json(route, [{
    itemKey: runeKey, quantity: 1, equippedQuantity: equipped ? 1 : 0,
    availableGrantIds: equipped ? [] : [grant],
  }]));
  await page.route('**/api/equipment', route => json(route, snapshot()));
  await page.route('**/api/equipment/**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: corsHeaders, status: 204 });
    expect(route.request().method()).toBe('POST');
    mutations++;
    equipped = true;
    return json(route, { items: [], stats: null, ruleVersion: 'equipment-v1' });
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-equip').click();
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout-item-relic')).toContainText('Frammento di runa');
  expect(mutations).toBe(1);
});

test('unequip HTTP 200 that still contains the slot forces a fresh owner read', async ({ page }) => {
  await signIn(page);
  let equipped = true;
  let mutations = 0;
  const item = { slot: 'relic', grantId: grant, itemKey: runeKey, equippedAtUtc: at };
  const snapshot = () => ({ items: equipped ? [item] : [], stats: null, ruleVersion: 'equipment-v1' });
  await page.route('**/api/inventory', route =>
    json(route, [{ grantId: grant, itemKey: runeKey, quantity: 1, awardedAtUtc: at }]));
  await page.route('**/api/inventory/stacks', route => json(route, [{
    itemKey: runeKey, quantity: 1, equippedQuantity: equipped ? 1 : 0,
    availableGrantIds: equipped ? [] : [grant],
  }]));
  await page.route('**/api/equipment', route => json(route, snapshot()));
  await page.route('**/api/equipment/**', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: corsHeaders, status: 204 });
    expect(route.request().method()).toBe('DELETE');
    mutations++;
    equipped = false;
    return json(route, { items: [item], stats: null, ruleVersion: 'equipment-v1' });
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-loadout-unequip-relic').click();
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout-item-relic')).toContainText('Vuoto');
  expect(mutations).toBe(1);
});
