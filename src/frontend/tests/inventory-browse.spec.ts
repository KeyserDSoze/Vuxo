import { expect, test, type Page } from '@playwright/test';

const shard = '11111111-1111-4111-8111-111111111111';
const seed = '22222222-2222-4222-8222-222222222222';
const pearl = '33333333-3333-4333-8333-333333333333';
const usedSeed = '44444444-4444-4444-8444-444444444444';

const awards = [
  { grantId: shard, itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-03T10:00:00Z' },
  { grantId: seed, itemKey: 'item.grove_seed.v1', quantity: 3, awardedAtUtc: '2026-11-02T10:00:00Z' },
  { grantId: pearl, itemKey: 'item.tidal_pearl.v1', quantity: 2, awardedAtUtc: '2026-11-01T10:00:00Z' },
  { grantId: usedSeed, itemKey: 'item.grove_seed.v1', quantity: 1, consumed: true, awardedAtUtc: '2026-11-01T08:00:00Z' },
];
const stacks = [
  { itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 1, availableGrantIds: [] },
  { itemKey: 'item.grove_seed.v1', quantity: 3, equippedQuantity: 0, availableGrantIds: [seed] },
  { itemKey: 'item.tidal_pearl.v1', quantity: 2, equippedQuantity: 0, availableGrantIds: [pearl] },
];
const equipment = {
  items: [{ slot: 'relic', grantId: shard, itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-03T11:00:00Z' }],
  stats: null,
  ruleVersion: 'equipment-v1',
};

async function signIn(page: Page, id = 'owner-a', language: 'it' | 'en' = 'it') {
  await page.addInitScript(({ id, language }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.accessToken', 'test-token-' + id);
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id, displayName: id, email: null }));
  }, { id, language });
}

async function mockInventory(page: Page) {
  await page.route('**/api/inventory', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(awards),
  }));
  await page.route('**/api/inventory/stacks', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(stacks),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(equipment),
  }));
}

test('long owner inventory history is progressively shown without losing entries or making extra API calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  const history = Array.from({ length: 29 }, (_, index) => ({
    grantId: 'history-' + String(index).padStart(3, '0'),
    itemKey: index % 2 ? 'item.grove_seed.v1' : 'item.rune_shard.v1',
    quantity: 1, consumed: index % 3 === 0,
    awardedAtUtc: new Date(Date.UTC(2026, 10, 3, 12, index)).toISOString(),
  }));
  let historyReads = 0;
  await page.route('**/api/inventory', route => {
    historyReads++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(history) });
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await page.getByTestId('inventory-view-journal').click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(12);
  await expect(page.getByTestId('inventory-journal-progress')).toHaveText('History displayed: 12 of 29');
  // React StrictMode can mount effects twice in Development. The contract
  // is that paging/view changes make NO further owner API requests.
  const initialReads = historyReads;
  expect(initialReads).toBeGreaterThan(0);
  const next = page.getByTestId('inventory-journal-more');
  await expect(next).toHaveText('Show 12 more events');
  await next.click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(24);
  await expect(next).toHaveText('Show 5 more events');
  await next.click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(29);
  await expect(page.getByTestId('inventory-journal-progress')).toHaveText('History displayed: 29 of 29');
  await expect(next).toBeDisabled();
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toBeFocused();
  await expect(next).toHaveText('Full history displayed');
  await next.press('Enter');
  await expect(page.getByTestId('inventory-item')).toHaveCount(29);
  await expect(page.getByTestId('inventory-item').last()).toContainText('Rune Shard');
  expect(historyReads).toBe(initialReads);

  // Navigating back to the journal resets the visual batch, not the
  // owner API snapshot, while leaving all events accessible again.
  await page.getByTestId('inventory-view-gear').click();
  await expect(page.getByTestId('inventory-items')).toHaveCount(0);
  await page.getByTestId('inventory-view-journal').click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(12);
  await expect(next).toBeEnabled();
  expect(historyReads).toBe(initialReads);
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1 &&
      root.scrollHeight <= window.innerHeight + 1;
  })).toBe(true);
});

test('small histories render completely and retain the translated inventory view', async ({ page }) => {
  await signIn(page, 'owner-a', 'it');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await page.getByTestId('inventory-view-journal').click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-journal-more')).toHaveCount(0);
  await expect(page.getByTestId('inventory-journal-progress')).toHaveCount(0);
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('inventory-view-journal')).toContainText('History');
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
});

test('browse controls require authentication and issue no anonymous owner requests', async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('vuxo.language', 'it'); });
  const calls: string[] = [];
  page.on('request', request => {
    if (/\/api\/(inventory|equipment)/.test(new URL(request.url()).pathname)) calls.push(request.url());
  });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('Italian search matches localized names without case or accent sensitivity', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);

  await page.getByTestId('inventory-browse-search').fill('SÈmE');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Seme del bosco');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await expect(page.getByTestId('inventory-browse-results')).toContainText('3 su 7');

  await page.getByTestId('inventory-browse-search').fill('item.tidal_pearl.v1');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toContainText('Perla delle maree');
});

test('equipped and available filters use server grant IDs and never include consumed awards', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();

  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Equipaggiati' }).click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toContainText('Frammento di runa');

  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Disponibili' }).click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2);
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);
  await expect(page.getByTestId('inventory-items')).not.toContainText('Consumato');
  await expect(page.getByTestId('inventory-stacks')).not.toContainText('Frammento di runa');
});

test('quantity sort applies to stacks and awards, clear restores all entries', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await page.getByTestId('inventory-browse-sort').click();
  await page.getByRole('option', { name: 'Quantità (decrescente)' }).click();
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Seme del bosco');
  await expect(page.getByTestId('inventory-item').first()).toContainText('Seme del bosco');

  await page.getByTestId('inventory-browse-search').fill('non-existing');
  await expect(page.getByTestId('inventory-browse-empty')).toContainText('Nessun oggetto');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  await expect(page.getByTestId('inventory-empty')).toHaveCount(0);

  await page.getByTestId('inventory-browse-clear').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-browse-empty')).toHaveCount(0);
});

test('search and filter do not make gameplay API requests or mutate authoritative data', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  const unexpected: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    if ((/\/api\/(inventory|equipment)(\/|$)/.test(pathname) && method !== 'OPTIONS')
        || (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method))) {
      unexpected.push(method + ':' + pathname);
    }
  });
  await page.getByTestId('inventory-browse-search').fill('runa');
  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Tutti' }).click();
  await page.getByTestId('inventory-browse-sort').click();
  await page.getByRole('option', { name: 'Nome' }).click();
  await page.getByTestId('inventory-browse-clear').click();
  expect(unexpected).toEqual([]);
});

test('English dark 320px mobile layout re-sorts translated names without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find your items' })).toBeVisible();
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByTestId('inventory-stack').first()).toContainText('Grove Seed');
  await page.getByTestId('inventory-browse-search').fill('tidal');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const pageWidth = root.clientWidth;
    const overflow = root.scrollWidth - pageWidth;
    if (overflow <= 1) return 'PASS';
    const suspects = [...document.querySelectorAll<HTMLElement>('body *')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        testId: element.getAttribute('data-testid'),
        tag: element.tagName.toLowerCase(),
        css: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
        left: Math.round(rect.left), right: Math.round(rect.right),
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      };
    }).filter(item => item.right > pageWidth + 1 || item.left < -1 ||
      item.scrollWidth > item.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 14);
    return JSON.stringify({
      overflow, pageWidth, rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth, suspects,
    });
  })).toBe('PASS');
});

test('owner switch remounts inventory so previous items and filters are not flashed', async ({ page }) => {
  await signIn(page);
  let resolveSecond!: () => void;
  const secondPending = new Promise<void>(resolve => { resolveSecond = resolve; });
  await page.route('**/api/inventory', async route => {
    if (route.request().headers()['authorization'] === 'Bearer test-token-owner-b') await secondPending;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b' ? [] : awards),
    });
  });
  await page.route('**/api/inventory/stacks', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b' ? [] : stacks),
  }));
  await page.route('**/api/equipment', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().headers()['authorization'] === 'Bearer test-token-owner-b'
      ? { ...equipment, items: [] } : equipment),
  }));
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await page.getByTestId('inventory-browse-search').fill('Seme');
  await expect(page.getByTestId('inventory-item')).toHaveCount(2);

  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'test-token-owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'owner-b', displayName: 'Other', email: null }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
  resolveSecond();
  await expect(page.getByTestId('inventory-empty')).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
});

test('game-first inventory views separate gear, backpack and history without changing server data', async ({ page }) => {
  await signIn(page);
  await mockInventory(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-views')).toBeVisible();
  await expect(page.getByTestId('inventory-view-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);

  const unexpected: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    // Healing controls may poll encounter status independently. Switching
    // UI views must not re-fetch owner inventory/equipment or mutate them.
    if (/^\/api\/(inventory|equipment)(?:\/|$)/.test(url.pathname)
      && request.method() !== 'OPTIONS')
      unexpected.push(request.method() + ':' + url.pathname);
  });
  await page.getByTestId('inventory-view-gear').click();
  await expect(page.getByTestId('inventory-view-gear')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);

  // "Find" on an equipment slot changes only the local browse view/filter.
  await page.getByTestId('inventory-loadout-find-charm').click();
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-loadout')).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-controls')).toBeVisible();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2); // seed and pearl are available charms

  // This filter belongs only to the Backpack, never to the entire grant
  // history. A consumed item must remain visible in the Chronicle.
  await page.getByTestId('inventory-view-journal').click();
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-item').filter({ hasText: 'Consumato' })).toHaveCount(1);
  await page.getByTestId('inventory-view-bag').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2);
  await page.getByTestId('inventory-browse-clear').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await page.getByTestId('inventory-inspect').first().click();
  await expect(page.getByTestId('inventory-inspection')).toBeVisible();
  // A modal blocks the underlying navigation until dismissed.
  await page.getByTestId('inventory-inspection').press('Escape');
  await expect(page.getByTestId('inventory-inspection')).toHaveCount(0);

  await page.getByTestId('inventory-view-journal').click();
  await expect(page.getByTestId('inventory-inspection')).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-controls')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-view-journal')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('inventory-view-all').click();
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-loadout')).toBeVisible();
  expect(unexpected).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1
      && root.scrollHeight <= window.innerHeight + 1
      && document.scrollingElement!.scrollTop === 0;
  })).toBe(true);
});

test('inventory view controls are keyboard-accessible, translated and owner-scoped on 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/inventory');
  const nav = page.getByTestId('inventory-views');
  await expect(nav).toHaveAttribute('aria-label', 'Inventory views');
  const history = page.getByTestId('inventory-view-journal');
  await history.focus();
  await expect(history).toBeFocused();
  await history.press('Enter');
  await expect(history).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1 &&
      root.scrollHeight <= window.innerHeight + 1 &&
      getComputedStyle(document.querySelector('[data-testid="game-deck-scroll"]')!).overflowY === 'auto';
  })).toBe(true);

  // Account changes remount the owner view; do not retain another owner's
  // history or selected tab while the new read-model is pending.
  await page.evaluate(() => {
    localStorage.setItem('vuxo.accessToken', 'test-token-owner-b');
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'owner-b', displayName: 'Other', email: null,
    }));
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-view-journal')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('inventory-view-all')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.user');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
  await expect(page.getByTestId('inventory-views')).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(0);
});
