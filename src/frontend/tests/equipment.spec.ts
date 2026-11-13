import { expect, test, type Page } from '@playwright/test';
import { seedOwnerSession } from './support/vuxoFixtures';

const awardA = '11111111-1111-4111-8111-111111111111';
const awardB = '22222222-2222-4222-8222-222222222222';
const rune = 'item.rune_shard.v1';

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await seedOwnerSession(page, {
    token: 'equipment-test-token', userId: 'player-a', displayName: 'Player A', language,
  });
}

async function mockEquipment(page: Page) {
  let equipped = false;
  let postCount = 0;
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const fulfill = (route: import('@playwright/test').Route, data: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(data) });

  const stats = () => ({
    strength: 2, dexterity: 2, intelligence: equipped ? 3 : 2,
    constitution: 2, luck: 1, faith: 1, maxHealth: 20,
    movementSpeedMultiplier: 1.2,
    bonuses: {
      strength: 0, dexterity: 0, intelligence: equipped ? 1 : 0,
      constitution: 0, luck: 0, faith: 0,
    },
  });
  const equipment = () => ({
    items: equipped ? [{
      slot: 'relic', grantId: awardA, itemKey: rune,
      equippedAtUtc: '2026-11-04T12:00:00Z',
    }] : [],
    stats: stats(), ruleVersion: 'equipment-v1',
  });
  await page.route('**/api/inventory', route => fulfill(route, [{
    grantId: awardA, itemKey: rune, quantity: 1, awardedAtUtc: '2026-11-04T11:00:00Z',
  }, {
    grantId: awardB, itemKey: rune, quantity: 1, awardedAtUtc: '2026-11-04T12:00:00Z',
  }]));
  await page.route('**/api/inventory/stacks', route => fulfill(route, [{
    itemKey: rune, quantity: 2, equippedQuantity: equipped ? 1 : 0,
    availableGrantIds: equipped ? [awardB] : [awardA, awardB],
  }]));
  await page.route('**/api/equipment', route => fulfill(route, equipment()));
  await page.route('**/api/equipment/**', route => {
    const req = route.request();
    if (req.method() === 'POST') {
      postCount++;
      if (equipped) return fulfill(route, { code: 'equipment_slot_occupied' }, 409);
      equipped = true;
    } else if (req.method() === 'DELETE') {
      equipped = false;
    }
    return fulfill(route, equipment());
  });
  return { postCount: () => postCount };
}

test('inventory stacks multiple awards without deleting original provenance and equips a relic', async ({ page }) => {
  await signIn(page);
  const backend = await mockEquipment(page);
  await page.goto('./#/inventory');
  const stack = page.getByTestId('inventory-stack');
  await expect(stack).toHaveCount(1);
  await expect(stack).toContainText('Copie possedute: 2');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await page.getByTestId('inventory-equip').click();
  await expect(page.getByTestId('inventory-unequip')).toBeVisible();
  await expect(page.getByTestId('equipment-stats')).toContainText('Intelligenza: 3 (+1)');
  await expect(stack).toContainText('Equipaggiate: 1');
  expect(backend.postCount()).toBe(1);

  await page.getByTestId('inventory-unequip').click();
  await expect(page.getByTestId('inventory-equip')).toBeVisible();
  await expect(page.getByTestId('equipment-stats')).toContainText('Intelligenza: 2 (+0)');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
});

test('English mobile loadout is responsive and shows stat preview disclaimer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'en');
  await mockEquipment(page);
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toContainText('Owned copies: 2');
  await expect(page.getByTestId('inventory-equip')).toHaveText('Equip');
  await expect(page.getByTestId('equipment-stats')).toContainText('Bonuses do not change base allocation');
});

test('anonymous clients cannot read stack or equipment endpoints', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  let calls = 0;
  await page.route('**/api/inventory/stacks', route => {
    calls++;
    return route.fulfill({ status: 401, body: '' });
  });
  await page.route('**/api/equipment', route => {
    calls++;
    return route.fulfill({ status: 401, body: '' });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  expect(calls).toBe(0);
});
