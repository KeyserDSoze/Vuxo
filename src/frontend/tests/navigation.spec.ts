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
  await expect(page.getByRole('link', { name: 'Accedi per iniziare' })).toHaveAttribute('href', '#/auth');

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
  await expect(page.getByRole('link', { name: 'Entra nel prototipo' })).toHaveAttribute('href', '#/game');

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

test('JWT and persisted session expiry independently hide admin navigation', async ({ page }) => {
  await seedSession(page, makeJwt('Administrator', 1_000), '2099-01-01T00:00:00Z');
  await page.goto('./#/');
  await expect(page.getByTestId('desktop-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0);

  await page.evaluate(token => {
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2000-01-01T00:00:00Z');
  }, makeJwt('Administrator'));
  await page.reload();
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
