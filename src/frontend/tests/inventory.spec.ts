import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, language: 'it' | 'en' = 'it') {
  const expiresAtUtc = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await page.addInitScript(({ expiresAtUtc, language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'playwright-inventory-token');
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'player-a', displayName: 'Inventory Hero', email: null,
    }));
  }, { expiresAtUtc, language });
}

test('inventory requires a Vuxo login and never reads anonymously', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
  });
  let calls = 0;
  await page.route('**/api/inventory', route => {
    calls++;
    return route.fulfill({ status: 401, body: '' });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toContainText('Accedi');
  await expect(page.getByTestId('inventory-items')).toHaveCount(0);
  expect(calls).toBe(0);
});

test('Italian inventory displays only server awards with canonical translated name and quantity', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/inventory', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([{
      grantId: '11111111-1111-4111-8111-111111111111',
      itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-04T10:00:00Z',
    }]),
  }));

  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  await expect(page.getByTestId('inventory-items')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toContainText('Frammento di runa');
  await expect(page.getByTestId('inventory-item')).toContainText('Quantità: 1');
  await expect(page.getByTestId('inventory-item')).not.toContainText('11111111');
});

test('English mobile inventory has responsive empty, item and error states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'en');
  await page.route('**/api/inventory', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([]),
  }));
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-empty')).toContainText('You have no items yet');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

  await page.unroute('**/api/inventory');
  await page.route('**/api/inventory', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([{
      grantId: '22222222-2222-4222-8222-222222222222',
      itemKey: 'item.tidal_pearl.v1', quantity: 1, awardedAtUtc: '2026-11-04T10:00:00Z',
    }]),
  }));
  await page.reload();
  await expect(page.getByTestId('inventory-item')).toContainText('Tidal Pearl');
  await expect(page.getByTestId('inventory-item')).toContainText('Quantity: 1');
});
