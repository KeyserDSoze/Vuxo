import { expect, test, type Page } from '@playwright/test';
import { seedOwnerSession } from './support/vuxoFixtures';

const grantId = '11111111-1111-4111-8111-111111111111';
const sequence = ['sun', 'moon', 'star', 'wave'];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  await seedOwnerSession(page, {
    token: 'playwright-session-token', userId: 'player-a', displayName: 'E2E player', language,
  });
}

async function mockPortalApi(page: Page) {
  const attempts: string[][] = [];
  let consumed = false;
  await page.route('**/api/personal-content**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const url = new URL(request.url());
    let status = 200;
    let body: unknown;
    if (request.method() === 'GET' && url.pathname === '/api/personal-content') {
      body = consumed ? [] : [{
        id: grantId, contentKey: 'portal.memory.grove', portalKey: 'challenge.sequence.v1',
        expiresAtUtc: null,
      }];
    } else if (request.method() === 'GET' && url.pathname.endsWith('/challenge')) {
      body = { grantId, version: 'portal-sequence-v1', sequence };
    } else if (request.method() === 'POST' && url.pathname.endsWith('/challenge/attempt')) {
      const submitted = (request.postDataJSON() as { sequence: string[] }).sequence;
      attempts.push(submitted);
      if (JSON.stringify(submitted) !== JSON.stringify(sequence)) {
        status = 422;
        body = { code: 'portal_challenge_incorrect' };
      } else {
        consumed = true;
        body = { id: grantId, consumedAtUtc: '2026-11-04T00:00:00Z' };
      }
    } else {
      status = 404;
      body = { code: 'exclusive_content_not_found' };
    }
    await route.fulfill({ status, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return attempts;
}

test('portal requires authentication and offers the login link', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('./#/portals');
  await expect(page.getByTestId('portal-auth-required')).toBeVisible();
  await expect(page.getByTestId('portal-start')).toHaveCount(0);
});

test('player memorizes runes, completes challenge and cannot replay consumed grant', async ({ page }) => {
  await signIn(page);
  const attempts = await mockPortalApi(page);
  await page.goto('./#/portals');
  await expect(page.getByTestId('portal-start')).toBeVisible();
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toContainText('Sole');
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });

  for (const rune of sequence) {
    await page.getByTestId('portal-rune-' + rune).click();
  }
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-complete')).toContainText('Sfida completata');
  expect(attempts).toEqual([sequence]);
  await page.getByRole('button', { name: 'Torna ai portali' }).click();
  await expect(page.getByTestId('portal-empty')).toBeVisible();
});

test('wrong answer shows localized error and mobile rune controls remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'en');
  const attempts = await mockPortalApi(page);
  await page.goto('./#/portals');
  await expect(page.getByRole('heading', { name: 'Portal challenges' })).toBeVisible();
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });

  for (const rune of ['sun', 'sun', 'star', 'wave']) {
    await page.getByTestId('portal-rune-' + rune).click();
  }
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-error')).toContainText('Wrong sequence');
  await expect(page.getByTestId('portal-progress')).toContainText('0 / 4');
  expect(attempts).toEqual([['sun', 'sun', 'star', 'wave']]);
  await expect(page.getByTestId('portal-rune-moon')).toBeVisible();
});

test('a verified wrong rune sequence shows canonical portal damage in Italian', async ({ page }) => {
  await signIn(page, 'it');
  await page.route('**/api/personal-content**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET' && path === '/api/personal-content')
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: grantId, contentKey: 'portal.memory.grove',
          portalKey: 'challenge.sequence.v1', expiresAtUtc: null }]) });
    if (route.request().method() === 'GET' && path.endsWith('/challenge'))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ grantId, version: 'portal-sequence-v1', sequence }) });
    if (route.request().method() === 'POST' && path.endsWith('/challenge/attempt'))
      return route.fulfill({ status: 422, contentType: 'application/json',
        body: JSON.stringify({
          code: 'portal_challenge_incorrect', damage: 2,
          currentHealth: 18, maxHealth: 20, damageApplied: true,
        }) });
    return route.fulfill({ status: 404 });
  });

  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  for (const rune of ['sun', 'sun', 'star', 'wave'])
    await page.getByTestId('portal-rune-' + rune).click();
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-error')).toContainText('Sequenza errata');
  await expect(page.getByTestId('portal-mistake-damage')).toContainText('2 HP');
  await expect(page.getByTestId('portal-mistake-damage')).toContainText('18/20');
  await expect(page.getByTestId('portal-mistake-damage').getByRole('link', { name: 'Vai al Rifugio' })).toBeVisible();
});

test('mobile English displays no extra penalty on repeated mistakes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'en');
  await page.route('**/api/personal-content**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET' && path === '/api/personal-content')
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: grantId, contentKey: 'portal.memory.grove',
          portalKey: 'challenge.sequence.v1', expiresAtUtc: null }]) });
    if (route.request().method() === 'GET' && path.endsWith('/challenge'))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ grantId, version: 'portal-sequence-v1', sequence }) });
    if (route.request().method() === 'POST' && path.endsWith('/challenge/attempt'))
      return route.fulfill({ status: 422, contentType: 'application/json',
        body: JSON.stringify({
          code: 'portal_challenge_incorrect', damage: 0,
          currentHealth: 18, maxHealth: 20, damageApplied: false,
        }) });
    return route.fulfill({ status: 404 });
  });

  await page.goto('./#/portals');
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
  for (const rune of ['moon', 'moon', 'star', 'wave'])
    await page.getByTestId('portal-rune-' + rune).click();
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-error')).toContainText('Wrong sequence');
  await expect(page.getByTestId('portal-mistake-damage')).toContainText('do not cause additional damage');
  await expect(page.getByTestId('portal-mistake-damage')).toContainText('18/20');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
