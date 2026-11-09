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

test('missing translation key falls back to localized generic auth error', async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await page.route('**/api/auth/social', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'unknown_future_auth_error' }),
  }));

  await page.goto('./#/auth');
  await page.getByTestId('auth-microsoft').click();

  await expect(page.getByTestId('auth-error')).toHaveText('Non è stato possibile completare l’accesso.');
});


test('account reflects login and logout from another browser tab without reload', async ({ page, context }) => {
  await context.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await context.route('**/api/auth/social', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(sessionResponse('microsoft')),
  }));
  await context.route('**/api/auth/logout', route => route.fulfill({ status: 204 }));

  const secondTab = await context.newPage();
  await page.goto('./#/auth');
  await secondTab.goto('./#/auth');
  await expect(page.getByTestId('auth-microsoft')).toBeVisible();
  await secondTab.getByTestId('auth-microsoft').click();
  await expect(secondTab.getByTestId('auth-user')).toContainText('microsoft Player');
  await expect(page.getByTestId('auth-user')).toContainText('microsoft Player');

  await page.getByTestId('auth-logout').click();
  await expect(secondTab.getByTestId('auth-user')).toHaveCount(0);
  await expect(secondTab.getByTestId('auth-microsoft')).toBeVisible();
  await secondTab.close();
});

test('account removes expired session on focus and restores provider sign-in', async ({ page }) => {
  await installAuthRoutes(page, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(sessionResponse('microsoft')),
  }));
  await page.goto('./#/auth');
  await page.getByTestId('auth-microsoft').click();
  await expect(page.getByTestId('auth-user')).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2000-01-01T00:00:00Z');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByTestId('auth-user')).toHaveCount(0);
  await expect(page.getByTestId('auth-microsoft')).toBeVisible();
});

test('already authenticated account skips provider fetch until the session ends', async ({ page }) => {
  await page.goto('./#/');
  await page.evaluate(({ token, id }) => {
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id, displayName: 'Existing Player', email: null,
    }));
  }, { token: makeJwt('google'), id: userId });

  let providerRequests = 0;
  await page.route('**/api/auth/providers', async route => {
    providerRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(providerConfiguration()),
    });
  });

  await page.locator('a[href="#/auth"]').first().click();
  await expect(page.getByTestId('auth-user')).toContainText('Existing Player');
  expect(providerRequests).toBe(0);

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByTestId('auth-microsoft')).toBeVisible();
  expect(providerRequests).toBe(1);
});

test('late logout response does not delete a newer session from a second tab', async ({ page, context }) => {
  let releaseLogout: (() => void) | undefined;
  await context.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await context.route('**/api/auth/social', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(sessionResponse('microsoft')),
  }));
  await context.route('**/api/auth/logout', async route => {
    await new Promise<void>(resolve => { releaseLogout = resolve; });
    await route.fulfill({ status: 204 });
  });

  const secondTab = await context.newPage();
  await page.goto('./#/auth');
  await secondTab.goto('./#/');
  await page.getByTestId('auth-microsoft').click();
  await expect(page.getByTestId('auth-user')).toContainText('microsoft Player');

  await page.getByTestId('auth-logout').click();
  await expect.poll(() => Boolean(releaseLogout)).toBe(true);
  await secondTab.evaluate((newSession) => {
    localStorage.setItem('vuxo.accessToken', newSession.accessToken);
    localStorage.setItem('vuxo.auth.expiresAtUtc', newSession.expiresAtUtc);
    localStorage.setItem('vuxo.auth.user', JSON.stringify(newSession.user));
  }, sessionResponse('google'));
  await expect(page.getByTestId('auth-user')).toContainText('google Player');

  releaseLogout?.();
  await expect(page.getByTestId('auth-user')).toContainText('google Player');
  await expect.poll(() => secondTab.evaluate(() => localStorage.getItem('vuxo.accessToken'))).toBe(makeJwt('google'));
  await secondTab.close();
});


test('failed social provider configuration is recoverable without reloading on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  await page.route('**/api/auth/providers', async route => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
        code: 'social_provider_configuration_unavailable',
      }) });
    } else {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(providerConfiguration()) });
    }
  });
  await page.goto('./#/auth');
  await expect(page.getByTestId('auth-error')).toContainText('configurazione dei provider');
  await expect(page.getByTestId('auth-retry-providers')).toBeVisible();

  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('auth-retry-providers')).toHaveText('Try again');
  await page.getByTestId('auth-retry-providers').click();

  await expect(page.getByTestId('auth-microsoft')).toHaveText('Sign in with Microsoft');
  await expect(page.getByTestId('auth-error')).toHaveCount(0);
  await expect(page.getByTestId('auth-retry-providers')).toHaveCount(0);
  expect(attempts).toBe(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('valid configuration without any enabled providers is a distinct empty state', async ({ page }) => {
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      microsoft: { enabled: false, clientId: null, tenantId: null },
      google: { enabled: false, clientId: null },
    }),
  }));
  await page.goto('./#/auth');
  await expect(page.getByText('Nessun provider social è configurato su questo ambiente.')).toBeVisible();
  await expect(page.getByTestId('auth-retry-providers')).toHaveCount(0);
  await expect(page.getByTestId('auth-error')).toHaveCount(0);
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
    microsoft: { enabled: true, clientId: 'e2e-microsoft-client', tenantId: 'consumers' },
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

test('Google SDK loading failure is recoverable without reload or repeated GIS initialization', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addInitScript(() => {
    (window as Window & { __vuxoE2ERealGoogleSdk?: boolean }).__vuxoE2ERealGoogleSdk = true;
  });
  let scriptAttempts = 0;
  let credentialExchanges = 0;
  await page.route('https://accounts.google.com/gsi/client', async route => {
    scriptAttempts += 1;
    if (scriptAttempts === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: [
        'window.__vuxoGoogleInitCalls = 0;',
        'window.google = { accounts: { id: {',
        '  initialize(options) {',
        '    window.__vuxoGoogleInitCalls += 1;',
        '    window.__vuxoGoogleCallback = options.callback;',
        '  },',
        '  renderButton(parent, options) {',
        '    const button = document.createElement("button");',
        '    button.textContent = "Mock Google sign in";',
        '    button.dataset.locale = options.locale;',
        '    button.addEventListener("click", () => window.__vuxoGoogleCallback({ credential: "mock-google-credential" }));',
        '    parent.appendChild(button);',
        '  }',
        '} } };',
      ].join('\n'),
    });
  });
  await page.route('**/api/auth/providers', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(providerConfiguration()),
  }));
  await page.route('**/api/auth/social', async route => {
    credentialExchanges += 1;
    const body = route.request().postDataJSON() as { provider: string; credential: string };
    expect(body).toEqual({ provider: 'google', credential: 'mock-google-credential' });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sessionResponse('google')) });
  });
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }));

  await page.goto('./#/auth');
  await expect(page.getByTestId('auth-google-sdk-error')).toContainText('non è stato caricato');
  await expect(page.getByTestId('auth-error')).toHaveCount(0);
  await page.getByTestId('auth-google-sdk-retry').click();

  const googleButton = page.getByTestId('auth-google').getByRole('button', { name: 'Mock Google sign in' });
  await expect(googleButton).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __vuxoGoogleInitCalls?: number }).__vuxoGoogleInitCalls)).toBe(1);
  expect(scriptAttempts).toBe(2);

  await page.getByTestId('language-toggle').click();
  await expect(googleButton).toHaveAttribute('data-locale', 'en');
  await expect.poll(() => page.evaluate(() => (window as Window & { __vuxoGoogleInitCalls?: number }).__vuxoGoogleInitCalls)).toBe(1);
  await googleButton.click();
  await expect(page.getByTestId('auth-user')).toContainText('google Player');
  await page.getByTestId('auth-logout').click();
  await expect(googleButton).toBeVisible();
  await googleButton.click();
  await expect(page.getByTestId('auth-user')).toContainText('google Player');
  expect(credentialExchanges).toBe(2);
  expect(scriptAttempts).toBe(2);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
