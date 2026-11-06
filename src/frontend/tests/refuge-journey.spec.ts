import { expect, test, type Page } from '@playwright/test';

const fullEquipment = {
  items: [
    { slot: 'relic', grantId: '11111111-1111-4111-8111-111111111111', itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-01T10:00:00Z' },
    { slot: 'charm', grantId: '22222222-2222-4222-8222-222222222222', itemKey: 'item.grove_seed.v1', equippedAtUtc: '2026-11-01T10:00:00Z' },
  ],
  stats: null,
  ruleVersion: 'equipment-v1',
};

function signIn(page: Page, token = 'journey-owner-1') {
  return page.evaluate(token => {
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: token, displayName: token, email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  }, token);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('full HP and two equipped slots provide advisory navigation, never a readiness score', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && /\/api\/(characters\/me|equipment)/.test(new URL(request.url()).pathname)) {
      mutations.push(request.method() + ' ' + request.url());
    }
  });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Hero', currentHealth: 20, maxHealth: 20, rulesVersion: 'v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(fullEquipment),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await signIn(page);
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'full');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'equipped');
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('refuge-journey-action-health')).toHaveAttribute('href', '#/refuge/training');
  await expect(page.getByTestId('refuge-journey-action-equipment')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-journey-action-encounter')).toHaveAttribute('href', '#/portals');
  await expect(page.getByTestId('refuge-journey-disclaimer')).toContainText('non un giudizio di prontezza');
  expect(mutations).toEqual([]);
});

test('missing HP and empty slots offer a focusable route to existing rest and inventory', async ({ page }) => {
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Hero', currentHealth: 9, maxHealth: 20, rulesVersion: 'v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ ...fullEquipment, items: [] }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ active: true, portalGrantId: '33333333-3333-4333-8333-333333333333', expiresAtUtc: '2099-01-01T00:00:00Z' }),
  }));
  await page.goto('./#/refuge');
  await signIn(page);
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'recover');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'active');
  await page.getByTestId('refuge-journey-action-health').click();
  await expect(page.getByTestId('refuge-health')).toBeFocused();
  await expect(page.getByTestId('refuge-journey-action-equipment')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-journey-action-encounter')).toHaveAttribute('href', '#/portals');
});

test('zero HP never suggests resting or Grove Seed healing as a remedy', async ({ page }) => {
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Hero', currentHealth: 0, maxHealth: 20, rulesVersion: 'v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ ...fullEquipment, items: [fullEquipment.items[0]] }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await signIn(page);
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'down');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'partial');
  await expect(page.getByTestId('refuge-journey-health')).toContainText('non funzionano a zero HP');
  await expect(page.getByTestId('refuge-journey-action-health')).toHaveAttribute('href', '#/character');
  await expect(page.getByTestId('refuge-journey-health')).not.toContainText('Controlla cura e riposo');
});

test('failed equipment and encounter GET stay unknown and full refresh re-reads all three', async ({ page }) => {
  let recovered = false;
  const counts = { health: 0, equipment: 0, encounter: 0 };
  await page.route('**/api/characters/me/health', route => {
    counts.health++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Hero', currentHealth: recovered ? 20 : 11, maxHealth: 20, rulesVersion: 'v1' }),
    });
  });
  await page.route('**/api/equipment', route => {
    counts.equipment++;
    return recovered
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(fullEquipment) })
      : route.fulfill({ status: 503 });
  });
  await page.route('**/api/characters/me/encounter', route => {
    counts.encounter++;
    return recovered
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }) })
      : route.fulfill({ status: 503 });
  });

  await page.goto('./#/refuge');
  await signIn(page);
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'recover');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('refuge-journey-action-equipment')).toHaveText('Rileggi i dati');

  recovered = true;
  await page.getByTestId('refuge-journey-action-equipment').click();
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'full');
  await expect(page.getByTestId('refuge-journey-equipment')).toHaveAttribute('data-state', 'equipped');
  await expect(page.getByTestId('refuge-journey-encounter')).toHaveAttribute('data-state', 'idle');
  expect(counts.health).toBeGreaterThanOrEqual(2);
  expect(counts.equipment).toBeGreaterThanOrEqual(2);
  expect(counts.encounter).toBeGreaterThanOrEqual(2);
});

test('guest and character 404 have no advisory checklist and no private equipment reads', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/equipment', route => {
    reads++;
    return route.fulfill({ status: 401 });
  });
  await page.route('**/api/characters/me/encounter', route => {
    reads++;
    return route.fulfill({ status: 401 });
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-journey')).toHaveCount(0);
  expect(reads).toBe(0);

  await page.route('**/api/characters/me/health', route => route.fulfill({ status: 404 }));
  await signIn(page);
  await expect(page.getByTestId('refuge-health-not-found')).toBeVisible();
  await expect(page.getByTestId('refuge-journey')).toHaveCount(0);
  expect(reads).toBe(0);
});

test('switching accounts hides the previous advice until owner-scoped reads complete', async ({ page }) => {
  let releaseSecond!: () => void;
  const secondPending = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/api/characters/me/health', async route => {
    const second = route.request().headers()['authorization'] === 'Bearer journey-owner-2';
    if (second) await secondPending;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Hero', currentHealth: second ? 20 : 7, maxHealth: 20, rulesVersion: 'v1' }),
    });
  });
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(fullEquipment),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await signIn(page);
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'recover');
  await signIn(page, 'journey-owner-2');
  await expect(page.getByTestId('refuge-journey')).toHaveCount(0);
  releaseSecond();
  await expect(page.getByTestId('refuge-journey-health')).toHaveAttribute('data-state', 'full');

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-journey')).toHaveCount(0);
});

test('English dark mobile guide remains usable at 320px without Phaser', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  const gameChunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js/.test(new URL(request.url()).pathname)) gameChunks.push(request.url());
  });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Hero', currentHealth: 18, maxHealth: 20, rulesVersion: 'v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ ...fullEquipment, items: [] }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await signIn(page);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('heading', { name: 'Your next step' })).toBeVisible();
  await expect(page.getByTestId('refuge-journey-equipment')).toContainText('No equipment slots filled');
  await expect(page.getByTestId('refuge-journey-disclaimer')).toContainText('not a readiness score');
  await page.getByTestId('refuge-journey-action-health').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('refuge-health')).toBeFocused();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(gameChunks).toEqual([]);
});
