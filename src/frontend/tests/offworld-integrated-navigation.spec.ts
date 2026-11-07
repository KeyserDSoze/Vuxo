import { expect, test, type Page } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (data: unknown) => ({
  headers: corsHeaders, contentType: 'application/json',
  body: JSON.stringify(data),
});

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'integration-owner-a');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'integration-owner-a', displayName: 'Vuxian Integration', email: null,
    }));
  }, { language });
}

async function ownerReads(page: Page) {
  await page.route('**/api/characters/me/health', route =>
    route.fulfill(json({ name: 'Vuxian Integration', currentHealth: 16,
      maxHealth: 20, rulesVersion: 'v1' })));
  await page.route('**/api/characters/me/encounter', route =>
    route.fulfill(json({ active: false, portalGrantId: null, expiresAtUtc: null })));
  await page.route('**/api/equipment', route =>
    route.fulfill(json({ items: [], stats: null, ruleVersion: 'equipment-v1' })));
  await page.route('**/api/inventory', route => route.fulfill(json([])));
  await page.route('**/api/inventory/stacks', route => route.fulfill(json([])));
  await page.route('**/api/personal-content', route => route.fulfill(json([])));
  await page.route('**/api/personal-content/history/completed*', route =>
    route.fulfill(json({ items: [], page: 1, pageSize: 20, hasMore: false })));
  await page.route('**/api/personal-content/history/outcomes*', route =>
    route.fulfill(json({ items: [], page: 1, pageSize: 20, hasMore: false })));
}

test('guest home, Refuge and Journal coexist without private owner requests', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
  });
  const privateReads: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(equipment|inventory|personal-content|characters\/me)/.test(path)) {
      privateReads.push(path);
    }
  });
  await page.goto('./#/');
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-journey')).toHaveCount(0);
  await expect(page.getByTestId('refuge-activity-journal')).toBeVisible();
  await page.getByTestId('refuge-activity-journal').click();
  await expect(page).toHaveURL(/#\/refuge\/journal$/);
  await expect(page.getByTestId('refuge-journal-auth-required')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed')).toHaveCount(0);
  expect(privateReads).toEqual([]);
});

test('an owner moves between Refuge preparation, Journal and inventory loadout', async ({ page }) => {
  await signIn(page);
  await ownerReads(page);
  const unwanted: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(inventory|equipment|personal-content|characters\/me)/.test(path) &&
      request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      unwanted.push(request.method() + ' ' + path);
    }
    if (/\/assets\/GamePage-[^/]+\.js/.test(path)) unwanted.push('phaser');
  });

  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-preparation')).toBeVisible();
  await expect(page.getByTestId('refuge-journey')).toBeVisible();
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'recover');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'idle');
  await page.getByTestId('refuge-activity-journal').click();
  await expect(page.getByRole('heading', { name: 'Diario del Rifugio' })).toBeVisible();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-portals-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-completed-empty')).toBeVisible();
  await page.getByTestId('refuge-journal-back').click();
  await expect(page.getByTestId('refuge-journey')).toBeVisible();
  await page.getByTestId('refuge-preparation-inventory').click();
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout-slot-relic')).toBeVisible();
  await expect(page.getByTestId('inventory-loadout-slot-charm')).toBeVisible();
  expect(unwanted).toEqual([]);
});

test('English mobile dark flows keep navigation, focus and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await signIn(page, 'en');
  await ownerReads(page);
  await page.goto('./#/refuge');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('heading', { name: 'Your next step' })).toBeVisible();
  await page.getByTestId('refuge-activity-journal').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Refuge journal' })).toBeVisible();
  await page.getByTestId('refuge-journal-back').click();
  await expect(page.getByTestId('refuge-journey')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

/** A held owner-A response must not resurrect inventory or journal data after account B signs in. */
async function holdOwnerAInventory(page: Page) {
  let notifyA!: () => void;
  let releaseA!: () => void;
  const startedA = new Promise<void>(resolve => { notifyA = resolve; });
  const pendingA = new Promise<void>(resolve => { releaseA = resolve; });
  const previousOwnerReward = [{
    grantId: 'abcdefab-abcd-4abc-8abc-abcdefabcdef',
    itemKey: 'item.rune_shard.v1', quantity: 1,
    awardedAtUtc: '2026-11-06T12:00:00Z', consumed: false,
  }];
  const requested: string[] = [];
  await page.route('**/api/inventory', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const auth = route.request().headers()['authorization'] ?? '';
    requested.push(auth);
    if (auth === 'Bearer integration-owner-a') {
      notifyA();
      await pendingA;
      // The browser may have already aborted A's fetch. That is expected.
      await route.fulfill(json(previousOwnerReward)).catch(() => {});
    } else {
      await route.fulfill(json([]));
    }
  });
  return { startedA, releaseA, requested };
}

async function switchToOwnerB(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'integration-owner-b');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'integration-owner-b', displayName: 'Vuxian Second', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
}

test('Journal ignores a previous owner reward returned after an account switch', async ({ page }) => {
  await signIn(page);
  await ownerReads(page);
  const held = await holdOwnerAInventory(page);
  await page.goto('./#/refuge/journal');
  await held.startedA;
  await switchToOwnerB(page);
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  expect(held.requested).toContain('Bearer integration-owner-b');
  held.releaseA();
  await expect(page.getByTestId('refuge-journal-rewards-empty')).toBeVisible();
  await expect(page.getByTestId('refuge-journal-reward')).toHaveCount(0);
});

test('Inventory keeps owner-B empty loadout when owner-A fetch completes late', async ({ page }) => {
  await signIn(page);
  await ownerReads(page);
  const held = await holdOwnerAInventory(page);
  await page.goto('./#/inventory');
  await held.startedA;
  await switchToOwnerB(page);
  await expect(page.getByTestId('inventory-empty')).toBeVisible();
  expect(held.requested).toContain('Bearer integration-owner-b');
  held.releaseA();
  await expect(page.getByTestId('inventory-empty')).toBeVisible();
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
});

test('Refuge rejects an owner-A health reply after owner-B account switch', async ({ page }) => {
  await signIn(page);
  await ownerReads(page);
  let releaseOld!: () => void;
  let notifyOld!: () => void;
  const seenOld = new Promise<void>(resolve => { notifyOld = resolve; });
  const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; });
  await page.route('**/api/characters/me/health', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (route.request().headers()['authorization'] === 'Bearer integration-owner-a') {
      notifyOld();
      await oldResponse;
      await route.fulfill(json({ name: 'Old character', currentHealth: 1,
        maxHealth: 20, rulesVersion: 'v1' })).catch(() => {});
      return;
    }
    await route.fulfill(json({ name: 'New character', currentHealth: 20,
      maxHealth: 20, rulesVersion: 'v1' }));
  });
  await page.goto('./#/refuge');
  await seenOld;
  await switchToOwnerB(page);
  await expect(page.getByTestId('refuge-health-count')).toContainText('20 / 20 HP');
  await expect(page.getByTestId('refuge-preparation')).toBeVisible();
  releaseOld();
  await expect(page.getByTestId('refuge-health-count')).toContainText('20 / 20 HP');
  await expect(page.getByTestId('refuge-preparation-hp-count')).toContainText('20 / 20 HP');
});
