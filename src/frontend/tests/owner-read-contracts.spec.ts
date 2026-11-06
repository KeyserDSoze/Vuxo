import { expect, test, type Page } from '@playwright/test';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const guid = '11111111-1111-4111-8111-111111111111';
const award = { grantId: guid, itemKey: 'item.rune_shard.v1', quantity: 1,
  awardedAtUtc: '2026-11-01T10:00:00Z', consumed: false };
const equipment = { items: [], stats: null, ruleVersion: 'equipment-v1' };
const health = { name: 'Explorer', currentHealth: 14, maxHealth: 20,
  rulesVersion: 'character-health-v1' };
const idle = { active: false, portalGrantId: null, expiresAtUtc: null };
const mock = (value: unknown) => ({ headers, contentType: 'application/json', body: JSON.stringify(value) });

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'contracts-owner-a');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'contracts-owner-a', displayName: 'Explorer', email: null,
    }));
  });
}
async function inventoryReads(page: Page) {
  await page.route('**/api/inventory/stacks', route => route.fulfill(mock([])));
  await page.route('**/api/equipment', route => route.fulfill(mock(equipment)));
}

test('duplicate owner inventory grant never appears as legitimate possessions', async ({ page }) => {
  await signIn(page);
  await inventoryReads(page);
  await page.route('**/api/inventory', route => route.fulfill(mock([award, award])));
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-error')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
});

test('duplicated equipment slot fails closed and refresh recovers an empty loadout', async ({ page }) => {
  await signIn(page);
  let corrupt = true;
  await page.route('**/api/inventory', route => route.fulfill(mock([award])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(mock([])));
  await page.route('**/api/equipment', route => route.fulfill(mock(corrupt
    ? { ...equipment, items: [
        { slot: 'relic', grantId: guid, itemKey: award.itemKey, equippedAtUtc: award.awardedAtUtc },
        { slot: 'relic', grantId: '22222222-2222-4222-8222-222222222222',
          itemKey: award.itemKey, equippedAtUtc: award.awardedAtUtc },
      ] }
    : equipment)));
  await page.goto('./#/inventory');
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  corrupt = false;
  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('equipment-error')).toHaveCount(0);
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
});

test('impossible HP cannot appear as full health and retry loads real owner HP', async ({ page }) => {
  await signIn(page);
  let corrupt = true;
  await page.route('**/api/characters/me/health', route =>
    route.fulfill(mock(corrupt ? { ...health, currentHealth: 25 } : health)));
  await page.route('**/api/equipment', route => route.fulfill(mock(equipment)));
  await page.route('**/api/characters/me/encounter', route => route.fulfill(mock(idle)));
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-health-error')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  corrupt = false;
  await page.getByTestId('refuge-health-retry').click();
  await expect(page.getByTestId('refuge-health-count')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation')).toBeVisible();
});

test('contradictory inactive encounter warns rather than suggesting idle combat', async ({ page }) => {
  await signIn(page);
  let corrupt = true;
  await page.route('**/api/characters/me/health', route => route.fulfill(mock(health)));
  await page.route('**/api/equipment', route => route.fulfill(mock(equipment)));
  await page.route('**/api/characters/me/encounter', route =>
    route.fulfill(mock(corrupt ? { ...idle, portalGrantId: guid } : idle)));
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-preparation-encounter-error')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toHaveCount(0);
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'unknown');
  corrupt = false;
  await page.getByTestId('refuge-preparation-refresh').click();
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toBeVisible();
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'idle');
});
