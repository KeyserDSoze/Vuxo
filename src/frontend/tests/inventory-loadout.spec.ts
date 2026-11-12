import { expect, test, type Page } from '@playwright/test';

const runeGrant = '11111111-1111-4111-8111-111111111111';
const seedGrant = '22222222-2222-4222-8222-222222222222';
const pearlGrant = '33333333-3333-4333-8333-333333333333';

const awards = [
  { grantId: runeGrant, itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-01T10:00:00Z' },
  { grantId: seedGrant, itemKey: 'item.grove_seed.v1', quantity: 1, awardedAtUtc: '2026-11-01T10:00:00Z' },
  { grantId: pearlGrant, itemKey: 'item.tidal_pearl.v1', quantity: 1, awardedAtUtc: '2026-11-01T10:00:00Z' },
];

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'loadout-owner-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'loadout-owner', displayName: 'Loadout Hero', email: null,
    }));
  }, { language });
}

async function mockLoadout(page: Page, initiallyEquipped = true) {
  let hasCharm = initiallyEquipped;
  let seedSpent = false;
  let deletes = 0;
  let equipmentGets = 0;
  let stackGets = 0;
  let failEquipment = false;
  let failNextStack = false;
  const equipment = () => ({
    items: hasCharm ? [{
      slot: 'charm', grantId: seedGrant,
      itemKey: 'item.grove_seed.v1', equippedAtUtc: '2026-11-01T10:00:00Z',
    }] : [],
    stats: null,
    ruleVersion: 'equipment-v1',
  });
  const stacks = () => [
    { itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [runeGrant] },
    ...(seedSpent ? [] : [{
      itemKey: 'item.grove_seed.v1', quantity: 1, equippedQuantity: hasCharm ? 1 : 0,
      availableGrantIds: hasCharm ? [] : [seedGrant],
    }]),
    { itemKey: 'item.tidal_pearl.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [pearlGrant] },
  ];
  await page.route('**/api/inventory', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(awards.map(a =>
      a.grantId === seedGrant && seedSpent ? { ...a, consumed: true } : a)),
  }));
  await page.route('**/api/inventory/stacks', route => {
    stackGets++;
    if (failNextStack) {
      failNextStack = false;
      return route.fulfill({ status: 503 });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(stacks()) });
  });
  await page.route('**/api/equipment', route => {
    equipmentGets++;
    return failEquipment
      ? route.fulfill({ status: 503 })
      : route.fulfill({ contentType: 'application/json', body: JSON.stringify(equipment()) });
  });
  await page.route('**/api/equipment/charm', route => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ status: 405 });
    deletes++;
    hasCharm = false;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(equipment()) });
  });
  return {
    deletes: () => deletes,
    equipmentGets: () => equipmentGets,
    stackGets: () => stackGets,
    failEquipment: (value: boolean) => { failEquipment = value; },
    failNextStack: () => { failNextStack = true; },
    markSeedSpent: () => { seedSpent = true; },
  };
}

test('guest cannot inspect equipment or loadout and no owner GET is made', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const ownerRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/(equipment|inventory)/.test(new URL(request.url()).pathname)) ownerRequests.push(request.url());
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  expect(ownerRequests).toEqual([]);
});

test('server-confirmed slots are visible and can filter available compatible objects', async ({ page }) => {
  await signIn(page);
  const api = await mockLoadout(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout-slot-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-loadout-item-charm')).toHaveText('Seme del bosco');
  await expect(page.getByTestId('inventory-loadout-healing-note')).toContainText('rimuovilo prima');
  await expect(page.getByTestId('inventory-loadout-unequip-charm')).toBeEnabled();
  await expect(page.getByTestId('inventory-loadout-unequip-relic')).toHaveCount(0);

  await page.getByTestId('inventory-loadout-find-charm').click();
  await expect(page.getByTestId('inventory-browse-search')).toBeFocused();
  await expect(page.getByTestId('inventory-browse-search')).toBeInViewport();
  await expect(page.getByTestId('inventory-browse-filter')).toContainText('Disponibili');
  await expect(page.getByTestId('inventory-browse-slot')).toContainText('Amuleto');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Perla delle maree');
  // Find now navigates into the Backpack: only the stacks/actions remain
  // visible, while the authoritative award history is in its own view.
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  expect(api.deletes()).toBe(0);

  await page.getByTestId('inventory-view-gear').click();
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await page.getByTestId('inventory-loadout-find-relic').click();
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-browse-slot')).toContainText('Reliquia');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack')).toContainText('Frammento di runa');
  expect(api.deletes()).toBe(0);
});


test('compatible item finder reveals search within GameDeck at 320px without extra owner reads', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, 'en');
  const api = await mockLoadout(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout-find-charm')).toBeVisible();
  const reads: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && /^\/api\/(equipment|inventory)(\/|$)/.test(path)) reads.push(path);
  });
  const find = page.getByTestId('inventory-loadout-find-charm');
  await find.focus();
  await expect(find).toBeFocused();
  await page.keyboard.press('Enter');
  const search = page.getByTestId('inventory-browse-search');
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-browse-filter')).toContainText('Available');
  await expect(page.getByTestId('inventory-browse-slot')).toContainText('Charm');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await expect.poll(() => page.evaluate(() => {
    const deck = document.querySelector<HTMLElement>('[data-testid="game-deck-scroll"]')!;
    const nav = deck.querySelector<HTMLElement>('[data-testid="inventory-views"]')!;
    const input = document.querySelector<HTMLInputElement>('[data-testid="inventory-browse-search"]')!;
    const a = deck.getBoundingClientRect(), b = input.getBoundingClientRect();
    return b.top >= a.top + nav.getBoundingClientRect().height - 1 && b.bottom <= a.bottom + 1;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1 &&
      root.scrollHeight <= innerHeight + 1 &&
      document.scrollingElement!.scrollTop === 0;
  })).toBe(true);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await info.attach('inventory-compatible-find-320', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  expect(reads).toEqual([]);
  expect(api.deletes()).toBe(0);
});

test('unequip uses one server DELETE and refreshes slot and available stack', async ({ page }) => {
  await signIn(page);
  const api = await mockLoadout(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout-item-charm')).toHaveText('Seme del bosco');
  await page.getByTestId('inventory-loadout-unequip-charm').click();
  await expect(page.getByTestId('inventory-loadout-slot-charm')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' }))
    .toContainText('Equipaggiate: 0');
  expect(api.deletes()).toBe(1);
  await page.getByTestId('inventory-loadout-find-charm').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2);
  await expect(page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' }))
    .toContainText('Copie possedute: 1');
});

test('failed equipment read shows unknown state and refresh recovers without mutation', async ({ page }) => {
  await signIn(page);
  const api = await mockLoadout(page);
  api.failEquipment(true);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-equipment-retry')).toBeVisible();

  api.failEquipment(false);
  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout-item-charm')).toHaveText('Seme del bosco');
  await expect(page.getByTestId('equipment-error')).toHaveCount(0);
  expect(api.equipmentGets()).toBeGreaterThanOrEqual(2);
  expect(api.deletes()).toBe(0);
});

test('lost stack refresh after confirmed mutation hides stale stock until safe GET retry', async ({ page }) => {
  await signIn(page);
  const api = await mockLoadout(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout-item-charm')).toHaveText('Seme del bosco');
  api.failNextStack();
  await page.getByTestId('inventory-loadout-unequip-charm').click();
  await expect(page.getByTestId('equipment-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  expect(api.deletes()).toBe(1);

  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout-slot-charm')).toContainText('Slot vuoto');
  await expect(page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' }))
    .toContainText('Equipaggiate: 0');
  expect(api.deletes()).toBe(1);
});

test('English dark mobile loadout can be operated with keyboard only', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await signIn(page, 'en');
  const api = await mockLoadout(page);
  await page.goto('./#/inventory');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('heading', { name: 'Your equipment' })).toBeVisible();
  await expect(page.getByTestId('inventory-loadout-healing-note')).toContainText('first unequip');
  await page.getByTestId('inventory-loadout-find-charm').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inventory-browse-slot')).toContainText('Charm');
  const gearTab = page.getByTestId('inventory-view-gear');
  await gearTab.focus();
  await page.keyboard.press('Enter');
  await expect(gearTab).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('inventory-loadout-unequip-charm').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inventory-loadout-slot-charm')).toContainText('Empty slot');
  expect(api.deletes()).toBe(1);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('confirmed healing with failed inventory refresh cannot expose stale consumables', async ({ page }) => {
  await signIn(page);
  const api = await mockLoadout(page, false);
  let healingPosts = 0;
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.route('**/api/characters/me/heal/**', route => {
    healingPosts++;
    api.markSeedSpent();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        grantId: seedGrant,
        idempotencyKey: route.request().headers()['idempotency-key'],
        previousHealth: 8, currentHealth: 18, maxHealth: 20,
        restoredHealth: 10, consumedAtUtc: '2026-11-06T12:00:00Z', replayed: false,
      }),
    });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await expect(page.getByTestId('inventory-heal')).toBeEnabled();
  api.failNextStack();
  await page.getByTestId('inventory-heal').click();
  await expect(page.getByTestId('inventory-heal-success')).toBeVisible();
  await expect(page.getByTestId('inventory-heal-refresh-error')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  expect(healingPosts).toBe(1);

  await page.getByTestId('inventory-equipment-retry').click();
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await expect(page.getByTestId('inventory-item').filter({ hasText: 'Seme del bosco' }))
    .toContainText('Consumato');
  await expect(page.getByTestId('inventory-stack').filter({ hasText: 'Seme del bosco' }))
    .toHaveCount(0);
  await expect(page.getByTestId('inventory-heal-refresh-error')).toHaveCount(0);
  expect(healingPosts).toBe(1);
});
