import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ active: false, portalGrantId: null, expiresAtUtc: null }),
  }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('home and desktop navigation lead to Refuge without downloading Phaser', async ({ page }) => {
  const gameChunks: string[] = [];
  page.on('request', request => {
    if (/\/assets\/GamePage-[^/]+\.js/.test(new URL(request.url()).pathname)) gameChunks.push(request.url());
  });
  await page.goto('./#/');
  await page.getByTestId('home-refuge-link').click();
  await expect(page).toHaveURL(/#\/refuge$/);
  await expect(page.getByTestId('refuge-page')).toBeVisible();
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-care')).toContainText('In progettazione');
  await expect(page.getByTestId('refuge-care').getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('desktop-nav').locator('a[href="#/refuge"]')).toBeVisible();
  expect(gameChunks).toHaveLength(0);
});

test('anonymous player can complete local rune practice with no game API requests', async ({ page }) => {
  const gameCalls: string[] = [];
  page.on('request', request => {
    if (/\/api\/(characters|inventory|equipment|portals|world)\b/.test(new URL(request.url()).pathname)) {
      gameCalls.push(request.url());
    }
  });
  await page.goto('./#/refuge');
  await page.getByTestId('refuge-start-training').click();
  await expect(page.getByTestId('rune-training-page')).toBeVisible();
  await expect(page.getByTestId('training-disclaimer')).toContainText('nessun premio');
  const sequence = await page.getByTestId('training-preview-rune').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-rune')!)
  );
  expect(sequence).toHaveLength(4);
  await page.getByTestId('training-ready').click();
  await expect(page.getByTestId('training-check')).toBeDisabled();
  for (const rune of sequence) {
    await page.getByTestId('training-rune-' + rune).click();
  }
  await expect(page.getByTestId('training-check')).toBeEnabled();
  await page.getByTestId('training-check').click();
  await expect(page.getByTestId('training-success')).toBeVisible();
  expect(gameCalls).toEqual([]);
  await page.getByTestId('training-again').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(4);
});

test('wrong sequence shows feedback and difficulty changes the number of runes', async ({ page }) => {
  await page.goto('./#/refuge/training');
  await page.getByTestId('training-difficulty-easy').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(3);
  const first = await page.getByTestId('training-preview-rune').first().getAttribute('data-rune');
  const wrong = first === 'sun' ? 'moon' : 'sun';
  await page.getByTestId('training-ready').click();
  for (let index = 0; index < 3; index++) {
    await page.getByTestId('training-rune-' + wrong).click();
  }
  await page.getByTestId('training-check').click();
  await expect(page.getByTestId('training-failure')).toBeVisible();
  await page.getByTestId('training-difficulty-hard').click();
  await expect(page.getByTestId('training-preview-rune')).toHaveCount(6);
  await expect(page.getByTestId('training-result')).toHaveCount(0);
});

for (const width of [320, 390]) {
  test('Refuge and training remain usable on mobile ' + width + 'px, in English dark mode', async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/refuge');
    await page.getByTestId('mobile-menu-toggle').click();
    await expect(page.getByTestId('mobile-nav').locator('a[href="#/refuge"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('language-toggle').click();
    await expect(page.getByRole('heading', { name: 'Your Refuge' })).toBeVisible();
    await page.getByTestId('theme-toggle').click();
    await page.getByTestId('theme-toggle').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await page.getByTestId('refuge-start-training').click();
    await expect(page.getByRole('heading', { name: 'Rune memory' })).toBeVisible();
    await expect(page.getByTestId('training-disclaimer')).toContainText('no rewards');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

test('signed in Refuge shows player without claiming care or backend rewards', async ({ page }) => {
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  // Simulate login without a reload: this exercises the shared session hook
  // rather than getting cleared by the per-navigation test initializer.
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'e2e.jwt.placeholder');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'visitor', displayName: 'Guest Hero', email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-welcome')).toContainText('Guest Hero');
  await expect(page.getByTestId('refuge-guest')).toHaveCount(0);
  await expect(page.getByTestId('refuge-activity-inventory')).toHaveAttribute('href', '#/inventory');
  await expect(page.getByTestId('refuge-activity-portals')).toHaveAttribute('href', '#/portals');
});


test('anonymous Refuge does not fetch private character health', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/characters/me/health', route => {
    requests += 1;
    return route.fulfill({ status: 401 });
  });
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
  await expect(page.getByTestId('refuge-health')).toHaveCount(0);
  expect(requests).toBe(0);
});

test('authenticated Refuge reads owner-only current HP and hides it after logout', async ({ page }) => {
  let bearer = '';
  await page.route('**/api/characters/me/health', route => {
    bearer = route.request().headers()['authorization'] ?? '';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1' }),
    });
  });
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-health-count')).toHaveText('7 / 20 HP');
  expect(bearer).toBe('Bearer e2e-health-token');
  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-health')).toHaveCount(0);
  await expect(page.getByTestId('refuge-guest')).toBeVisible();
});

test('health endpoint 404 offers character creation rather than fake healing', async ({ page }) => {
  await page.route('**/api/characters/me/health', route => route.fulfill({ status: 404 }));
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-health-not-found')).toBeVisible();
  await expect(page.getByTestId('refuge-health-not-found').getByRole('link')).toHaveAttribute('href', '#/character');
  await expect(page.getByTestId('refuge-care').getByRole('button')).toHaveCount(0);
});

test('health failure has an English mobile retry and shows authentic HP on recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route('**/api/characters/me/health', async route => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503 });
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Vuxian', currentHealth: 12, maxHealth: 20, rulesVersion: 'character-health-v1' }),
      });
    }
  });
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-health-error')).toBeVisible();
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('refuge-health-retry')).toHaveText('Try again');
  await page.getByTestId('refuge-health-retry').click();
  await expect(page.getByTestId('refuge-health-count')).toHaveText('12 / 20 HP');
  expect(attempts).toBe(2);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

async function loginForHealth(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'e2e-health-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'health-player', displayName: 'Health Hero', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
}


test('rest sends server intention with UUID key and displays confirmed health', async ({ page }) => {
  let currentHp = 7;
  const receivedKeys: string[] = [];
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: currentHp, maxHealth: 20,
      rulesVersion: 'character-health-v1'
    }),
  }));
  await page.route('**/api/characters/me/rest', route => {
    const key = route.request().headers()['idempotency-key'];
    receivedKeys.push(key);
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(route.request().headers()['authorization']).toBe('Bearer e2e-health-token');
    currentHp = 12;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        idempotencyKey: key, previousHealth: 7, currentHealth: currentHp,
        maxHealth: 20, restoredHealth: 5, replayed: false,
        restedAtUtc: '2026-11-05T12:00:00Z',
        nextRestAtUtc: '2026-11-05T12:30:00Z',
      }),
    });
  });
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-health-count')).toHaveText('7 / 20 HP');
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-success')).toContainText('5 HP');
  await expect(page.getByTestId('refuge-health-count')).toHaveText('12 / 20 HP');
  await expect(page.getByTestId('refuge-rest-button')).toBeDisabled();
  expect(receivedKeys).toHaveLength(1);
});

test('lost rest response can be retried with exactly the same idempotency key', async ({ page }) => {
  const keys: string[] = [];
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1'
    }),
  }));
  await page.route('**/api/characters/me/rest', route => {
    const key = route.request().headers()['idempotency-key'];
    keys.push(key);
    if (keys.length === 1) return route.fulfill({ status: 503 });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        idempotencyKey: key, previousHealth: 7, currentHealth: 12,
        maxHealth: 20, restoredHealth: 5, replayed: true,
        restedAtUtc: '2026-11-05T12:00:00Z',
        nextRestAtUtc: '2026-11-05T12:30:00Z',
      }),
    });
  });
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-rest-button')).toBeVisible();
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-error')).toBeVisible();
  await expect(page.getByTestId('refuge-rest-button')).toHaveText('Riprova il riposo');
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-success')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('cooldown is enforced by server and translated on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: 9, maxHealth: 20, rulesVersion: 'character-health-v1'
    }),
  }));
  await page.route('**/api/characters/me/rest', route => route.fulfill({
    status: 409,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'rest_cooldown', nextAllowedAtUtc: '2026-11-05T12:30:00Z' }),
  }));
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await page.getByTestId('language-toggle').click();
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-cooldown')).toContainText('30 minutes');
  await expect(page.getByTestId('refuge-health-count')).toHaveText('9 / 20 HP');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('rest is not offered to unauthenticated or fully healed characters', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/characters/me/rest', route => {
    requests += 1;
    return route.fulfill({ status: 401 });
  });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: 20, maxHealth: 20,
      rulesVersion: 'character-health-v1'
    }),
  }));
  await page.goto('./#/refuge');
  await expect(page.getByTestId('refuge-rest')).toHaveCount(0);
  await loginForHealth(page);
  await expect(page.getByTestId('refuge-rest-full')).toBeVisible();
  await expect(page.getByTestId('refuge-rest-button')).toHaveCount(0);
  expect(requests).toBe(0);
});


test('server active portal encounter blocks resting in Refuge, including mobile English', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1',
    }),
  }));
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      active: true, portalGrantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAtUtc: '2099-01-01T00:03:00Z',
    }),
  }));
  let restPosts = 0;
  await page.route('**/api/characters/me/rest', route => {
    restPosts++;
    return route.fulfill({ status: 409 });
  });
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('refuge-health-count')).toHaveText('7 / 20 HP');
  await expect(page.getByTestId('refuge-rest-encounter')).toContainText('portal encounter');
  await expect(page.getByTestId('refuge-rest-button')).toBeDisabled();
  expect(restPosts).toBe(0);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('server conflict keeps health unchanged if encounter begins after status was read', async ({ page }) => {
  await page.route('**/api/characters/me/health', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1',
    }),
  }));
  await page.route('**/api/characters/me/rest', route => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ code: 'rest_encounter_active' }),
  }));
  await page.goto('./#/refuge');
  await loginForHealth(page);
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-encounter')).toContainText('incontro del portale');
  await expect(page.getByTestId('refuge-health-count')).toHaveText('7 / 20 HP');
  await expect(page.getByTestId('refuge-rest-success')).toHaveCount(0);
});
