import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.theme', 'system');
  });
  await page.route('**/api/characters/me/encounter', route => route.fulfill({
    json: { active: false, portalGrantId: null, expiresAtUtc: null },
  }));
});

async function login(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'refuge-command-test-owner');
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'refuge-owner', displayName: 'Dashboard Hero', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
}

const viewports = [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440]] as const;

for (const [width, height] of viewports) {
  test(`guest Refuge command board fits ${width}x${height} and scrolls within GameDeck`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const ownerCalls: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (/\/api\/(characters\/me|equipment)/.test(path)) ownerCalls.push(path);
    });
    await page.goto('./#/refuge');
    await expect(page.getByTestId('refuge-command-hero')).toBeVisible();
    await expect(page.getByTestId('refuge-command-guest')).toBeVisible();
    await expect(page.getByTestId('refuge-command-health')).toHaveCount(0);
    await expect(page.getByTestId('refuge-jump-health')).toHaveCount(0);
    await expect(page.getByTestId('refuge-jump-preparation')).toHaveCount(0);
    await expect(page.getByTestId('refuge-start-training')).toHaveAttribute('href', '#/refuge/training');
    await expect(page.getByTestId('refuge-enter-world')).toHaveAttribute('href', '#/game');
    await expect(page.getByTestId('refuge-activity-training')).toHaveAttribute('href', '#/refuge/training');
    await expect(page.getByTestId('refuge-care')).toContainText('In progettazione');
    expect(ownerCalls).toEqual([]);

    await page.getByTestId('refuge-jump-care').click();
    await expect(page.getByTestId('refuge-care')).toBeFocused();
    await expect(page.getByTestId('refuge-care')).toBeInViewport({ ratio: 0.25 });
    await expect.poll(() => page.evaluate(() => {
      const html = document.documentElement;
      const deck = document.querySelector('[data-testid="game-deck"]')!.getBoundingClientRect();
      return html.scrollWidth <= html.clientWidth + 1 &&
        html.scrollHeight <= window.innerHeight + 1 &&
        deck.top >= 0 && deck.bottom <= window.innerHeight + 1 &&
        document.scrollingElement!.scrollTop === 0;
    })).toBe(true);
    await page.getByTestId('refuge-jump-activities').click();
    await expect(page.getByTestId('refuge-activities-section')).toBeFocused();

    if (width === 390 || width === 1280) {
      await page.getByTestId('game-deck-scroll').evaluate(el => { el.scrollTop = 0; });
      await testInfo.attach(`refuge-command-guest-${width}x${height}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  });
}

test('health and rest show only confirmed owner HP, and overview updates from the server receipt', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/api/characters/me/health', route => route.fulfill({
    json: { name: 'Vuxian', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1' },
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    json: { items: [], stats: null, ruleVersion: 'equipment-v1' },
  }));
  let restCount = 0;
  await page.route('**/api/characters/me/rest', route => {
    restCount++;
    expect(route.request().headers().authorization).toBe('Bearer refuge-command-test-owner');
    expect(route.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
    return route.fulfill({
      json: {
        idempotencyKey: route.request().headers()['idempotency-key'],
        previousHealth: 7, currentHealth: 12, maxHealth: 20, restoredHealth: 5,
        replayed: false, restedAtUtc: '2026-11-05T12:00:00Z', nextRestAtUtc: '2026-11-05T12:30:00Z',
      },
    });
  });
  await page.goto('./#/refuge');
  await login(page);
  await expect(page.getByTestId('refuge-command-health')).toContainText('7 / 20 HP');
  await expect(page.getByTestId('refuge-health-count')).toHaveText('7 / 20 HP');
  await expect(page.getByTestId('refuge-jump-preparation')).toBeVisible();
  await page.getByTestId('refuge-command-review-health').click();
  await expect(page.getByTestId('refuge-health')).toBeFocused();
  await page.getByTestId('refuge-rest-button').click();
  await expect(page.getByTestId('refuge-rest-success')).toContainText('5 HP');
  await expect(page.getByTestId('refuge-command-health')).toContainText('12 / 20 HP');
  await expect(page.getByTestId('refuge-health-count')).toHaveText('12 / 20 HP');
  expect(restCount).toBe(1);

  await page.getByTestId('refuge-jump-preparation').click();
  await expect(page.getByTestId('refuge-preparation')).toBeFocused();
  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('refuge-command-health')).toHaveCount(0);
  await expect(page.getByTestId('refuge-health')).toHaveCount(0);
  await expect(page.getByTestId('refuge-preparation')).toHaveCount(0);
  await expect(page.getByTestId('refuge-command-guest')).toBeVisible();
});

test('404 and 503 are not presented as zero or full HP in command center', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let count = 0;
  await page.route('**/api/characters/me/health', route => {
    count += 1;
    if (count === 1) return route.fulfill({ status: 404 });
    if (count === 2) return route.fulfill({ status: 503 });
    return route.fulfill({
      json: { name: 'Vuxian', currentHealth: 9, maxHealth: 20, rulesVersion: 'character-health-v1' },
    });
  });
  await page.goto('./#/refuge');
  await login(page);
  await expect(page.getByTestId('refuge-health-not-found')).toBeVisible();
  await expect(page.getByTestId('refuge-command-unavailable')).toContainText('Nessun personaggio');
  await expect(page.getByTestId('refuge-command-health')).toHaveCount(0);
  await page.getByTestId('refuge-health-retry').click();
  await expect(page.getByTestId('refuge-health-error')).toBeVisible();
  await expect(page.getByTestId('refuge-command-unavailable')).toContainText('Stato non disponibile');
  await page.getByTestId('refuge-health-retry').click();
  await expect(page.getByTestId('refuge-command-health')).toContainText('9 / 20 HP');
  expect(count).toBe(3);
});

test('English dark Refuge section commands stay translated and keyboard reachable on narrow displays', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/refuge');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('refuge-command-status')).toContainText('Vuxian status');
  await expect(page.getByTestId('refuge-jump-activities')).toContainText('Activities and paths');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const button = page.getByTestId('refuge-jump-care');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('refuge-care')).toBeFocused();
  await expect(page.getByTestId('refuge-care')).toBeInViewport({ ratio: 0.25 });
});

test('prefers reduced motion disables hover animation in Refuge activity tiles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/refuge');
  const tile = page.locator('.vuxo-refuge-activity').first();
  await expect(tile).toHaveCSS('transition-duration', '0s');
  await tile.hover();
  await expect(tile).toHaveCSS('transform', 'none');
});
