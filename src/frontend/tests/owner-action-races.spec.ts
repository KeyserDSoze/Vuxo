import { expect, test, type Page, type Route } from '@playwright/test';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const seed = '11111111-1111-4111-8111-111111111111';
const rune = '22222222-2222-4222-8222-222222222222';
const pearl = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-11-05T10:00:00Z';
const award = (grantId: string, itemKey: string, consumed = false) =>
  ({ grantId, itemKey, quantity: 1, awardedAtUtc: stamp, consumed });
const stack = (grantId: string, itemKey: string) =>
  ({ itemKey, quantity: 1, equippedQuantity: 0, availableGrantIds: [grantId] });
const payload = (value: unknown) =>
  ({ headers: cors, contentType: 'application/json', body: JSON.stringify(value) });
const isB = (route: Route) => route.request().headers()['authorization'] === 'Bearer owner-b';

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', 'owner-a');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-a', displayName: 'Explorer A', email: null,
    }));
  });
}
async function idleEncounter(page: Page) {
  await page.route('**/api/characters/me/encounter', route => route.fulfill(payload({
    active: false, portalGrantId: null, expiresAtUtc: null,
  })));
}

test('a confirmed heal hides all old stock until a complete owner refresh', async ({ page }) => {
  await signIn(page);
  await idleEncounter(page);
  let spent = false;
  let postCount = 0;
  let equipPosts = 0;
  let unlockPost!: () => void;
  let unlockRefresh!: () => void;
  const postGate = new Promise<void>(resolve => { unlockPost = resolve; });
  const refreshGate = new Promise<void>(resolve => { unlockRefresh = resolve; });

  await page.route('**/api/inventory', async route => {
    if (spent) await refreshGate;
    await route.fulfill(payload([
      award(seed, 'item.grove_seed.v1', spent),
      award(rune, 'item.rune_shard.v1'),
    ]));
  });
  await page.route('**/api/inventory/stacks', async route => {
    if (spent) await refreshGate;
    await route.fulfill(payload([
      ...(!spent ? [stack(seed, 'item.grove_seed.v1')] : []),
      stack(rune, 'item.rune_shard.v1'),
    ]));
  });
  await page.route('**/api/equipment', async route => {
    if (spent) await refreshGate;
    await route.fulfill(payload({ items: [], stats: null, ruleVersion: 'equipment-v1' }));
  });
  await page.route('**/api/equipment/**', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    equipPosts++;
    return route.fulfill({ headers: cors, status: 409 });
  });
  await page.route('**/api/characters/me/heal/**', async route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    postCount++;
    const key = route.request().headers()['idempotency-key']!;
    await postGate;
    spent = true;
    await route.fulfill(payload({
      grantId: seed, idempotencyKey: key, previousHealth: 5,
      currentHealth: 15, maxHealth: 20, restoredHealth: 10,
      consumedAtUtc: stamp, replayed: false,
    }));
  });

  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-heal')).toBeEnabled();
  await expect(page.getByTestId('inventory-equip')).toBeEnabled();
  await page.getByTestId('inventory-heal').click();
  await expect.poll(() => postCount).toBe(1);
  await expect(page.getByTestId('inventory-heal')).toBeDisabled();
  await expect(page.getByTestId('inventory-equip')).toBeDisabled();
  expect(equipPosts).toBe(0);

  unlockPost();
  await expect(page.getByTestId('inventory-heal-success')).toBeVisible();
  // Success must not leave any old, actionable grant visible while reads wait.
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  unlockRefresh();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await expect(page.getByTestId('inventory-heal')).toHaveCount(0);
  expect(postCount).toBe(1);
  expect(equipPosts).toBe(0);
});

test('a delayed equip reserves the same lane and prevents a healing POST', async ({ page }) => {
  await signIn(page);
  await idleEncounter(page);
  let equipped = false;
  let equips = 0;
  let heals = 0;
  let unlock!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  await page.route('**/api/inventory', route => route.fulfill(payload([
    award(seed, 'item.grove_seed.v1'), award(rune, 'item.rune_shard.v1'),
  ])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(payload([
    stack(seed, 'item.grove_seed.v1'),
    ...(!equipped ? [stack(rune, 'item.rune_shard.v1')] :
      [{ ...stack(rune, 'item.rune_shard.v1'), equippedQuantity: 1, availableGrantIds: [] }]),
  ])));
  const equippedItem = {
    slot: 'relic', grantId: rune, itemKey: 'item.rune_shard.v1', equippedAtUtc: stamp,
  };
  await page.route('**/api/equipment', route => route.fulfill(payload({
    items: equipped ? [equippedItem] : [], stats: null, ruleVersion: 'equipment-v1',
  })));
  await page.route('**/api/equipment/**', async route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    equips++;
    await gate;
    equipped = true;
    await route.fulfill(payload({
      items: [equippedItem], stats: null, ruleVersion: 'equipment-v1',
    }));
  });
  await page.route('**/api/characters/me/heal/**', route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    heals++;
    return route.fulfill({ headers: cors, status: 409 });
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-equip').click();
  await expect.poll(() => equips).toBe(1);
  await expect(page.getByTestId('inventory-heal')).toBeDisabled();
  await expect(page.getByTestId('inventory-equip')).toBeDisabled();
  unlock();
  await expect(page.getByTestId('inventory-unequip')).toBeVisible();
  expect(equips).toBe(1);
  expect(heals).toBe(0);
});

test('account change during an in-flight equipment POST cannot publish the old loadout', async ({ page }) => {
  await signIn(page);
  let started = 0;
  let unlock!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  await page.route('**/api/inventory', route => route.fulfill(payload(
    isB(route) ? [award(pearl, 'item.tidal_pearl.v1')] :
      [award(rune, 'item.rune_shard.v1')],
  )));
  await page.route('**/api/inventory/stacks', route => route.fulfill(payload(
    isB(route) ? [stack(pearl, 'item.tidal_pearl.v1')] :
      [stack(rune, 'item.rune_shard.v1')],
  )));
  await page.route('**/api/equipment', route => route.fulfill(payload({
    items: [], stats: null, ruleVersion: 'equipment-v1',
  })));
  await page.route('**/api/equipment/**', async route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    started++;
    expect(route.request().headers()['authorization']).toBe('Bearer owner-a');
    await gate;
    try {
      await route.fulfill(payload({
        items: [{ slot: 'relic', grantId: rune, itemKey: 'item.rune_shard.v1',
          equippedAtUtc: stamp }], stats: null, ruleVersion: 'equipment-v1',
      }));
    } catch {
      // Owner change aborts the old request; browser may already close route.
    }
  });
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-equip').click();
  await expect.poll(() => started).toBe(1);
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-b', displayName: 'Explorer B', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack')).toContainText('Perla delle maree');
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  unlock();
  await expect(page.getByTestId('inventory-stack')).toContainText('Perla delle maree');
  await expect(page.getByTestId('inventory-loadout-item-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-heal-success')).toHaveCount(0);
  expect(started).toBe(1);
});

test('changing account during a pending rest cannot apply the old HP receipt to the new player', async ({ page }) => {
  await signIn(page);
  let restCalls = 0;
  let unlock!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  await idleEncounter(page);
  await page.route('**/api/equipment', route => route.fulfill(payload({
    items: [], stats: null, ruleVersion: 'equipment-v1',
  })));
  await page.route('**/api/characters/me/health', route => route.fulfill(payload({
    name: isB(route) ? 'Explorer B' : 'Explorer A',
    currentHealth: isB(route) ? 10 : 7, maxHealth: 20,
    rulesVersion: 'character-health-v1',
  })));
  await page.route('**/api/characters/me/rest', async route => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: cors, status: 204 });
    restCalls++;
    expect(route.request().headers()['authorization']).toBe('Bearer owner-a');
    const key = route.request().headers()['idempotency-key']!;
    await gate;
    try {
      await route.fulfill(payload({
        idempotencyKey: key, previousHealth: 7, currentHealth: 12,
        maxHealth: 20, restoredHealth: 5, restedAtUtc: stamp,
        nextRestAtUtc: '2026-11-05T10:30:00Z', replayed: false,
      }));
    } catch {
      // The old owner's request is intentionally aborted on session change.
    }
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-health-count')).toContainText('7 / 20');
  await page.getByTestId('refuge-rest-button').click();
  await expect.poll(() => restCalls).toBe(1);

  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-b', displayName: 'Explorer B', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-health-count')).toContainText('10 / 20');
  unlock();
  await expect(page.getByTestId('refuge-health-count')).toContainText('10 / 20');
  await expect(page.getByTestId('refuge-rest-success')).toHaveCount(0);
  expect(restCalls).toBe(1);
});
