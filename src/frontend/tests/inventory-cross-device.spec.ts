import { expect, test, type Page, type Route } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const rune = '11111111-1111-4111-8111-111111111111';
const when = '2026-11-05T10:00:00Z';
const award = { grantId: rune, itemKey: 'item.rune_shard.v1', quantity: 1,
  awardedAtUtc: when, consumed: false };
const runeItem = { slot: 'relic', grantId: rune, itemKey: award.itemKey, equippedAtUtc: when };
const stack = (equipped: boolean) => [{
  itemKey: award.itemKey, quantity: 1,
  equippedQuantity: equipped ? 1 : 0,
  availableGrantIds: equipped ? [] : [rune],
}];
const equipment = (equipped: boolean) => ({
  items: equipped ? [runeItem] : [], stats: null, ruleVersion: 'equipment-v1',
});
const json = (value: unknown) => ({
  headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(value),
});
async function owner(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'cross-device-owner');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'cross-device-owner', displayName: 'Explorer', email: null,
    }));
  });
}

test('two persistently conflicting owner GETs cannot expose a phantom equipped or usable grant', async ({ page }) => {
  await owner(page);
  let conflict = true;
  let equipmentGets = 0;
  let stackGets = 0;
  await page.route('**/api/inventory', route => route.fulfill(json([award])));
  await page.route('**/api/inventory/stacks', route => {
    if (route.request().method() === 'GET') stackGets++;
    return route.fulfill(json(stack(false)));
  });
  await page.route('**/api/equipment', route => {
    if (route.request().method() === 'GET') equipmentGets++;
    return route.fulfill(json(equipment(conflict)));
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-equip')).toHaveCount(0);
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  expect(equipmentGets).toBeGreaterThanOrEqual(2);
  expect(stackGets).toBeGreaterThanOrEqual(2);
  conflict = false;
  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout-slot-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-equip')).toBeEnabled();
  await expect(page.getByTestId('equipment-error')).toHaveCount(0);
});

test('a torn first read is repaired by a bounded pair refresh, not by combining old and new parts', async ({ page }) => {
  await owner(page);
  let equipmentGets = 0;
  await page.route('**/api/inventory', route => route.fulfill(json([award])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(json(stack(false))));
  await page.route('**/api/equipment', route => {
    equipmentGets++;
    return route.fulfill(json(equipment(equipmentGets === 1)));
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout-slot-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-equip')).toBeEnabled();
  expect(equipmentGets).toBeGreaterThanOrEqual(2);
});

test('a confirmed equip may be superseded by another device before GET refresh; latest owner GET wins', async ({ page }) => {
  await owner(page);
  let postCalls = 0;
  let equipmentGets = 0;
  await page.route('**/api/inventory', route => route.fulfill(json([award])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(json(stack(false))));
  await page.route('**/api/equipment', route => {
    equipmentGets++;
    return route.fulfill(json(equipment(false)));
  });
  await page.route('**/api/equipment/**', (route: Route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: corsHeaders, status: 204 });
    expect(route.request().method()).toBe('POST');
    postCalls++;
    // Device A succeeded, but device B immediately unequipped the relic.
    // The POST receipt is valid; the next GETs show current owner state.
    return route.fulfill(json(equipment(true)));
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-equip')).toBeEnabled();
  await page.getByTestId('inventory-equip').click();
  await expect(page.getByTestId('inventory-loadout-slot-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-equip')).toBeEnabled();
  expect(postCalls).toBe(1);
  expect(equipmentGets).toBeGreaterThanOrEqual(2);
});
