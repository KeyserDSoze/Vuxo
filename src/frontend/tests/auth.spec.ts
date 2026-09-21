import { expect, test, type Page, type Route } from '@playwright/test';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
});

for (const provider of ['microsoft', 'google'] as const) {
  test(`${provider} login exchanges provider credential for Vuxo session only`, async ({ page }) => {
    let receivedCredential: string | null = null;
    await installAuthRoutes(page, async route => {
      const request = route.request();
      const body = request.postDataJSON() as { provider: string; credential: string };
      receivedCredential = body.credential;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sessionResponse(provider)),
      });
    });

    await page.goto('./#/auth');
    const button = page.getByTestId(provider === 'microsoft' ? 'auth-microsoft' : 'auth-google');
    await button.click();

    await expect(page.getByTestId('auth-user')).toContainText(`${provider} Player`);
    expect(receivedCredential).toBe(`e2e-${provider}-id-token`);

    const storage = await page.evaluate(() => Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index)!;
        return [key, localStorage.getItem(key)];
      }),
    ));
    expect(storage['vuxo.accessToken']).toBe(makeJwt(provider));
    expect(JSON.stringify(storage)).not.toContain(`e2e-${provider}-id-token`);
  });
}

test('logout sends Vuxo JWT and clears local session even if provider SDK is absent', async ({ page }) => {
  let logoutAuthorization: string | null = null;
  await installAuthRoutes(page, async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(sessionResponse('google')),
    });
  }, authorization => { logoutAuthorization = authorization; });

  await page.goto('./#/auth');
  await page.getByTestId('auth-google').click();
  await expect(page.getByTestId('auth-user')).toBeVisible();

  await page.getByTestId('auth-logout').click();

  await expect(page.getByTestId('auth-user')).toHaveCount(0);
  expect(logoutAuthorization).toBe(`Bearer ${makeJwt('google')}`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vuxo.accessToken'))).toBeNull();
});

test('expired provider credential is localized and mobile layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await page.route('**/api/auth/social', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'social_credential_expired' }),
  }));

  await page.goto('./#/auth');
  await page.getByTestId('auth-microsoft').click();

  await expect(page.getByTestId('auth-error')).toContainText('scaduta');
  await expect(page.getByTestId('auth-google')).toBeVisible();

  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { name: 'Sign in to Vuxo' })).toBeVisible();
  await expect(page.getByTestId('auth-microsoft')).toHaveText('Sign in with Microsoft');
});

async function installAuthRoutes(
  page: Page,
  onSocial: (route: Route) => Promise<void>,
  onLogout: (authorization: string | null) => void = () => {},
) {
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await page.route('**/api/auth/social', onSocial);
  await page.route('**/api/auth/logout', async route => {
    onLogout(route.request().headers()['authorization'] ?? null);
    await route.fulfill({ status: 204 });
  });
}

function providerConfiguration() {
  return {
    microsoft: { enabled: true, clientId: 'e2e-microsoft-client', tenantId: 'common' },
    google: { enabled: true, clientId: 'e2e-google-client' },
  };
}

function sessionResponse(provider: 'microsoft' | 'google') {
  return {
    accessToken: makeJwt(provider),
    tokenType: 'Bearer',
    expiresAtUtc: '2099-01-01T00:00:00Z',
    user: {
      id: userId,
      displayName: `${provider} Player`,
      email: `${provider}@example.test`,
    },
  };
}

function makeJwt(provider: 'microsoft' | 'google'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: userId,
    name: `${provider} Player`,
    role: 'User',
    exp: 4_102_444_800,
  })}.e2e`;
}
