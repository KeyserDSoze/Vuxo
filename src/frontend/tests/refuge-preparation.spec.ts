import { expect, test, type Page } from '@playwright/test';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const equipment = {
  items: [
    { slot: 'relic', grantId: '11111111-1111-4111-8111-111111111111', itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-01T10:00:00Z' },
    { slot: 'charm', grantId: '22222222-2222-4222-8222-222222222222', itemKey: 'item.grove_seed.v1', equippedAtUtc: '2026-11-01T10:00:00Z' },
  ],
  stats: null,
  ruleVersion: 'equipment-v1',
};

function installSession(page: Page, token = 'readiness-owner-1', displayName = 'Vuxian') {
  return page.evaluate(({ token, displayName }) => {
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: token, displayName, email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  }, { token, displayName });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('anonymous Refuge does not request preparation data or load Phaser', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(characters\/me|equipment)/.test(path) ||
      /\/assets\/GamePage-[^/]+\.js$/.test(path)) requests.push(path);
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('preparation renders canonical HP, equipped slots and active encounter in Italian', async ({ page }) => {
  const authorization: string[] = [];
  await page.route('**/api/characters/me/health', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Vuxian', currentHealth: 9, maxHealth: 20, rulesVersion: 'character-health-v1' }),
  }));
  await page.route('**/api/equipment', route => {
    if (route.request().method() === 'GET') authorization.push(route.request().headers()['authorization'] ?? '');
    return route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(equipment) });
  });
  await page.route('**/api/characters/me/encounter', route => {
    if (route.request().method() === 'GET') authorization.push(route.request().headers()['authorization'] ?? '');
    return route.fulfill({ headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ active: true, portalGrantId: '33333333-3333-4333-8333-333333333333', expiresAtUtc: '2099-01-01T00:00:00Z' }),
    });
  });

  await page.goto('./#/refuge');
  await installSession(page);
  await expect(page.getByTestId('refuge-preparation-hp-count')).toHaveText('9 / 20 HP');
  await expect(page.getByTestId('refuge-preparation-hp-state')).toContainText('HP da recuperare');
  await expect(page.getByTestId('refuge-preparation-slot-relic')).toContainText('Reliquia');
  await expect(page.getByTestId('refuge-preparation-slot-charm')).toContainText('Amuleto');
  await expect(page.getByTestId('refuge-preparation-slot-relic')).not.toContainText('Slot vuoto');
  await expect(page.getByTestId('refuge-preparation-slot-charm')).not.toContainText('Slot vuoto');
  await expect(page.getByTestId('refuge-preparation-encounter-active')).toContainText('Incontro del portale attivo');
  await expect(page.getByTestId('refuge-preparation-inventory')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-preparation-portals')).toHaveAttribute('href', '#/portals');
  await expect(page.getByTestId('refuge-preparation-game')).toHaveAttribute('href', '#/game');
  expect(authorization.length).toBeGreaterThanOrEqual(2);
  expect(authorization.every(value => value === 'Bearer readiness-owner-1')).toBe(true);
});

test('independent equipment and encounter failures never masquerade as empty or idle, refresh recovers', async ({ page }) => {
  let equipmentRequests = 0;
  let encounterRequests = 0;
  let recovered = false;
  await page.route('**/api/characters/me/health', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Vuxian', currentHealth: 20, maxHealth: 20, rulesVersion: 'character-health-v1' }),
  }));
  await page.route('**/api/equipment', route => {
    equipmentRequests++;
    return !recovered
      ? route.fulfill({ headers: corsHeaders, status: 503 })
      : route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ ...equipment, items: [] }) });
  });
  await page.route('**/api/characters/me/encounter', route => {
    encounterRequests++;
    return !recovered
      ? route.fulfill({ headers: corsHeaders, status: 503 })
      : route.fulfill({ headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }) });
  });
  await page.goto('./#/refuge');
  await installSession(page);
  await expect(page.getByTestId('refuge-preparation-hp-state')).toContainText('HP al massimo');
  await expect(page.getByTestId('refuge-preparation-equipment-error')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation-encounter-error')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation-slot-relic')).toHaveCount(0);
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toHaveCount(0);

  recovered = true;
  await page.getByTestId('refuge-preparation-refresh').click();
  await expect(page.getByTestId('refuge-preparation-slot-relic')).toContainText('Slot vuoto');
  await expect(page.getByTestId('refuge-preparation-slot-charm')).toContainText('Slot vuoto');
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toBeVisible();
  expect(equipmentRequests).toBeGreaterThanOrEqual(2);
  expect(encounterRequests).toBeGreaterThanOrEqual(2);
});

test('character 404 does not trigger equipment and encounter requests', async ({ page }) => {
  const otherRequests: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(equipment|characters\/me\/encounter)/.test(path)) otherRequests.push(path);
  });
  await page.route('**/api/characters/me/health', route => route.fulfill({ headers: corsHeaders, status: 404 }));
  await page.goto('./#/refuge');
  await installSession(page);
  await expect(page.getByTestId('refuge-health-not-found')).toBeVisible();
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  expect(otherRequests).toEqual([]);
});

test('switching owner hides previous HP and equipment before the next owner responds', async ({ page }) => {
  let releaseSecond!: () => void;
  const waitForSecond = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/api/characters/me/health', async route => {
    const auth = route.request().headers()['authorization'];
    if (auth === 'Bearer readiness-owner-2') await waitForSecond;
    return route.fulfill({ headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        name: auth === 'Bearer readiness-owner-1' ? 'First' : 'Second',
        currentHealth: auth === 'Bearer readiness-owner-1' ? 5 : 18,
        maxHealth: 20, rulesVersion: 'character-health-v1',
      }),
    });
  });
  await page.route('**/api/equipment', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify(equipment),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await installSession(page, 'readiness-owner-1', 'First Hero');
  await expect(page.getByTestId('refuge-preparation-hp-count')).toHaveText('5 / 20 HP');

  await installSession(page, 'readiness-owner-2', 'Second Hero');
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  await expect(page.getByTestId('refuge-health-count')).toHaveCount(0);
  releaseSecond();
  await expect(page.getByTestId('refuge-preparation-hp-count')).toHaveText('18 / 20 HP');

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
});

test('downed HP, empty equipment, inactive encounter and links work in mobile English dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/api/characters/me/health', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Vuxian', currentHealth: 0, maxHealth: 20, rulesVersion: 'character-health-v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ ...equipment, items: [] }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.goto('./#/refuge');
  await installSession(page);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('heading', { name: 'Adventure preparation' })).toBeVisible();
  await expect(page.getByTestId('refuge-preparation-hp-state')).toContainText('Zero HP');
  await expect(page.getByTestId('refuge-preparation-slot-relic')).toContainText('Empty slot');
  await expect(page.getByTestId('refuge-preparation-encounter-idle')).toContainText('No active encounter reported');
  await expect(page.getByTestId('refuge-preparation-inventory')).toHaveAttribute('href', '#/inventory');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('confirmed server rest updates both HP displays without inventing local healing', async ({ page }) => {
  const restKeys: string[] = [];
  await page.route('**/api/characters/me/health', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1' }),
  }));
  await page.route('**/api/equipment', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json', body: JSON.stringify({ ...equipment, items: [] }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({ headers: corsHeaders,
    contentType: 'application/json',
    body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.route('**/api/characters/me/rest', route => {
    // Preflight must not be treated as a rest attempt or consume a key.
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ headers: corsHeaders, status: 204 });
    if (route.request().method() !== 'POST')
      return route.fulfill({ headers: corsHeaders, status: 405 });
    const key = route.request().headers()['idempotency-key'] ?? '';
    restKeys.push(key);
    return route.fulfill({ headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({
        idempotencyKey: key, previousHealth: 7, currentHealth: 12, maxHealth: 20,
        restoredHealth: 5, replayed: false, restedAtUtc: '2026-11-06T10:00:00Z',
        nextRestAtUtc: '2026-11-06T10:30:00Z',
      }),
    });
  });

  await page.goto('./#/refuge');
  await installSession(page);
  await expect(page.getByTestId('refuge-preparation-hp-count')).toHaveText('7 / 20 HP');
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-success')).toBeVisible();
  await expect(page.getByTestId('refuge-health-count')).toHaveText('12 / 20 HP');
  await expect(page.getByTestId('refuge-preparation-hp-count')).toHaveText('12 / 20 HP');
  expect(restKeys).toHaveLength(1);
  expect(restKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);
});
