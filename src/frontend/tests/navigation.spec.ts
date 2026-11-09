import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

test('anonymous visitors cannot see the admin link on desktop or mobile', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Inizia l’avventura' })).toHaveAttribute('href', '#/auth');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('mobile-menu-toggle').click();
  await expect(page.getByTestId('mobile-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByTestId('mobile-nav').getByRole('link', { name: 'Personaggio' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mobile-nav')).not.toBeVisible();
});

for (const role of ['User', 'GameMaster'] as const) {
  test(role + ' cannot see admin navigation or open the protected route', async ({ page }) => {
    await seedSession(page, makeJwt(role));
    await page.goto('./#/');
    await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await page.goto('./#/admin');
    await expect(page.getByTestId('admin-access-denied')).toContainText('riservata al ruolo Administrator');
  });
}

test('valid Administrator session shows the admin link and the game CTA', async ({ page }) => {
  await seedSession(page, makeJwt('Administrator'));
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entra nel mondo' })).toHaveAttribute('href', '#/game');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('mobile-menu-toggle').click();
  await expect(page.getByTestId('mobile-nav').getByRole('link', { name: 'Admin' })).toBeVisible();
});

test('invalid JWT and expired session cannot reveal the admin link', async ({ page }) => {
  await seedSession(page, 'invalid.jwt', '2099-01-01T00:00:00Z');
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('vuxo.accessToken', 'invalid.jwt'));
  await page.goto('./#/admin');
  await expect(page.getByTestId('admin-access-denied')).toContainText('sessione Vuxo autenticata');
});

test('expired JWT cannot reveal admin navigation even with a future stored session expiry', async ({ page }) => {
  await seedSession(page, makeJwt('Administrator', 1_000), '2099-01-01T00:00:00Z');
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('expired stored session cannot reveal admin navigation even with a valid JWT', async ({ page }) => {
  await seedSession(page, makeJwt('Administrator'), '2000-01-01T00:00:00Z');
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('logging in as Administrator and logging out update the menu without reload', async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      microsoft: { enabled: true, clientId: 'e2e-microsoft-client', tenantId: 'common' },
      google: { enabled: false, clientId: null }
    }),
  }));
  await page.route('**/api/auth/social', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      accessToken: makeJwt('Administrator'),
      tokenType: 'Bearer',
      expiresAtUtc: '2099-01-01T00:00:00Z',
      user: { id: 'test-player', displayName: 'Admin Player', email: null },
    }),
  }));
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }));

  await page.goto('./#/auth');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.getByTestId('auth-microsoft').click();
  await expect(page.getByTestId('auth-user')).toContainText('Admin Player');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toBeVisible();

  await page.getByTestId('auth-logout').click();
  await expect(page.getByTestId('auth-user')).toHaveCount(0);
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('mobile menu is keyboard accessible and closes after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/auth');

  const toggle = page.getByTestId('mobile-menu-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mobile-nav')).toBeVisible();
  await page.getByTestId('mobile-nav').getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('mobile-nav')).not.toBeVisible();
});

async function seedSession(page: Page, accessToken: string, expiresAtUtc = '2099-01-01T00:00:00Z') {
  await page.addInitScript(({ token, expiry }) => {
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiry);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'test-player',
      displayName: 'Test player',
      email: null,
    }));
  }, { token: accessToken, expiry: expiresAtUtc });
}

function makeJwt(role: string, exp = 4_102_444_800): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none', typ: 'JWT' }) + '.' + encode({ role, exp }) + '.e2e';
}


for (const width of [320, 390, 768, 1200, 1280, 1920]) {
  test('game command navigation stays inside viewport at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('./#/');
    await expect(page.getByTestId('shell-brand')).toHaveAttribute('href', '#/');
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);
    if (width >= 1200) {
      await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Gioco' })).toBeVisible();
    } else {
      await expect(page.getByTestId('mobile-menu-toggle')).toBeVisible();
      await page.getByTestId('mobile-menu-toggle').click();
      await expect(page.getByTestId('mobile-nav').getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await page.keyboard.press('Escape');
    }
  });
}

test('active game navigation remains in sync across game and refuge without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#/');
  const game = page.getByTestId('desktop-nav').getByRole('link', { name: 'Gioco' });
  await game.click();
  await expect(page).toHaveURL(/#\/game$/);
  await expect(game).toHaveAttribute('aria-current', 'page');
  await expect(game).toHaveAttribute('data-active', 'true');
  await page.getByTestId('desktop-nav').getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
});
