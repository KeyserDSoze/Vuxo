import { expect, test, type Page } from '@playwright/test';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const grant = '11111111-1111-4111-8111-111111111111';
const when = '2026-11-05T10:00:00Z';
const award = (consumed = false) => ({
  grantId: grant, itemKey: 'item.grove_seed.v1', quantity: 1,
  awardedAtUtc: when, consumed,
});
const stack = () => ({
  itemKey: 'item.grove_seed.v1', quantity: 1, equippedQuantity: 0,
  availableGrantIds: [grant],
});
const loadout = { items: [], stats: null, ruleVersion: 'equipment-v1' };
const idle = { active: false, portalGrantId: null, expiresAtUtc: null };
const json = (value: unknown) => ({
  headers: cors, contentType: 'application/json', body: JSON.stringify(value),
});

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'foreground-owner');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'foreground-owner', displayName: 'Explorer', email: null,
    }));
  });
}

test('returning to Inventory updates stock consumed on another device without another POST', async ({ page }) => {
  await signIn(page);
  let spent = false;
  let ownerGets = 0;
  let writes = 0;
  await page.route('**/api/inventory', route => {
    if (route.request().method() === 'GET') ownerGets++;
    return route.fulfill(json([award(spent)]));
  });
  await page.route('**/api/inventory/stacks', route =>
    route.fulfill(json(spent ? [] : [stack()])));
  await page.route('**/api/equipment', route => route.fulfill(json(loadout)));
  await page.route('**/api/characters/me/encounter', route => route.fulfill(json(idle)));
  page.on('request', request => {
    if (/\/(heal|equip)$/.test(new URL(request.url()).pathname) &&
        request.method() === 'POST') writes++;
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-heal')).toBeEnabled();
  const initialReads = ownerGets;
  spent = true; // the second device consumed this seed
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect.poll(() => ownerGets).toBeGreaterThan(initialReads);
  expect(writes).toBe(0);
});

test('returning to Refuge reloads HP and encounter after another device starts combat', async ({ page }) => {
  await signIn(page);
  let currentHealth = 8;
  let inCombat = false;
  await page.route('**/api/characters/me/health', route => route.fulfill(json({
    name: 'Explorer', currentHealth, maxHealth: 20, rulesVersion: 'character-health-v1',
  })));
  await page.route('**/api/equipment', route => route.fulfill(json(loadout)));
  await page.route('**/api/characters/me/encounter', route => route.fulfill(json(
    inCombat ? { active: true, portalGrantId: grant, expiresAtUtc: '2026-11-08T10:00:00Z' } : idle,
  )));
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-health-count')).toContainText('8 / 20');
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toBeVisible();
  currentHealth = 12;
  inCombat = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('refuge-health-count')).toContainText('12 / 20');
  await expect(page.getByTestId('refuge-preparation-encounter-active')).toBeVisible();
  await expect(page.getByTestId('refuge-rest-button')).toBeDisabled();
});

test('unknown encounter status blocks Rest until the owner GET succeeds', async ({ page }) => {
  await signIn(page);
  let failing = true;
  let writes = 0;
  await page.route('**/api/characters/me/health', route => route.fulfill(json({
    name: 'Explorer', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1',
  })));
  await page.route('**/api/equipment', route => route.fulfill(json(loadout)));
  await page.route('**/api/characters/me/encounter', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    return failing ? route.fulfill({ headers: cors, status: 503 })
      : route.fulfill(json(idle));
  });
  await page.route('**/api/characters/me/rest', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    writes++;
    return route.fulfill({ headers: cors, status: 409 });
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-rest-encounter-unavailable')).toBeVisible();
  await expect(page.getByTestId('refuge-rest-button')).toBeDisabled();
  expect(writes).toBe(0);
  failing = false;
  await page.getByTestId('refuge-encounter-retry').click();
  await expect(page.getByTestId('refuge-rest-encounter-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('refuge-rest-button')).toBeEnabled();
  expect(writes).toBe(0);
});

test('unknown encounter status blocks Healing until retry proves it is idle', async ({ page }) => {
  await signIn(page);
  let failing = true;
  let writes = 0;
  await page.route('**/api/inventory', route => route.fulfill(json([award()])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(json([stack()])));
  await page.route('**/api/equipment', route => route.fulfill(json(loadout)));
  await page.route('**/api/characters/me/encounter', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    return failing ? route.fulfill({ headers: cors, status: 503 })
      : route.fulfill(json(idle));
  });
  await page.route('**/api/characters/me/heal/**', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    writes++;
    return route.fulfill({ headers: cors, status: 409 });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-heal-encounter-unavailable')).toBeVisible();
  await expect(page.getByTestId('inventory-heal')).toBeDisabled();
  expect(writes).toBe(0);
  failing = false;
  await page.getByTestId('inventory-encounter-retry').click();
  await expect(page.getByTestId('inventory-heal-encounter-unavailable')).toHaveCount(0);
  await expect(page.getByTestId('inventory-heal')).toBeEnabled();
  expect(writes).toBe(0);
});
