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


for (const [width, height, language] of [
  [320, 568, 'it'], [390, 844, 'en'], [1280, 720, 'it'],
] as const) {
  test('owner inspection deck follows the visible sorted Backpack without API calls at ' + width,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await signIn(page, 'inspection-owner', language);
      let reads = 0;
      page.on('request', request => {
        if (/\/api\/(inventory|equipment)(\/|$)/.test(new URL(request.url()).pathname)) reads++;
      });
      await mockInventory(page);
      await page.goto('./#/inventory');
      const stack = page.getByTestId('inventory-stack');
      const inspect = page.getByTestId('inventory-inspect');
      const dialog = page.getByTestId('inventory-inspection');
      const key = page.getByTestId('inventory-inspection-key');
      const previous = page.getByTestId('inventory-inspection-prev');
      const next = page.getByTestId('inventory-inspection-next');
      const position = page.getByTestId('inventory-inspection-position');
      const expectedPosition = (n: number, total: number) => language === 'it'
        ? 'Oggetto ' + n + ' di ' + total : 'Item ' + n + ' of ' + total;
      // The owner's canonical keys stay fixed, but name sort is localized.
      const orderedKeys = language === 'it'
        ? ['item.rune_shard.v1', 'item.tidal_pearl.v1', 'item.grove_seed.v1']
        : ['item.grove_seed.v1', 'item.rune_shard.v1', 'item.tidal_pearl.v1'];
      const availableKeys = language === 'it'
        ? ['item.tidal_pearl.v1', 'item.grove_seed.v1']
        : ['item.grove_seed.v1', 'item.tidal_pearl.v1'];
      await expect(stack).toHaveCount(3);
      const initialReads = reads;
      expect(initialReads).toBeGreaterThan(0);
      const opener = inspect.first();
      await opener.click();
      await expect(dialog).toBeVisible();
      await expect(key).toHaveText(orderedKeys[0]);
      await expect(position).toHaveText(expectedPosition(1, 3));
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();
      await next.click();
      await expect(key).toHaveText(orderedKeys[1]);
      await expect(position).toHaveText(expectedPosition(2, 3));
      await previous.click();
      await expect(key).toHaveText(orderedKeys[0]);
      await next.click();
      await next.click();
      await expect(key).toHaveText(orderedKeys[2]);
      await expect(position).toHaveText(expectedPosition(3, 3));
      await expect(next).toBeDisabled();
      await expect(previous).toBeEnabled();
      await info.attach('inventory-inspection-deck-' + width, {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      });
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          && document.documentElement.scrollHeight <= innerHeight + 1
          && document.scrollingElement!.scrollTop === 0,
      )).toBe(true);
      await page.getByTestId('inventory-inspection-close').click();
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();

      // A server-grant-preserving filter narrows the inspection deck.
      await page.getByTestId('inventory-browse-filter').click();
      await page.getByRole('option', { name: language === 'it' ? 'Disponibili' : 'Available' }).click();
      await expect(stack).toHaveCount(2);
      await inspect.first().click();
      await expect(position).toHaveText(expectedPosition(1, 2));
      await expect(key).toHaveText(availableKeys[0]);
      await next.click();
      await expect(key).toHaveText(availableKeys[1]);
      await expect(position).toHaveText(expectedPosition(2, 2));
      await expect(next).toBeDisabled();
      // At the final item, the Next button becomes natively disabled and may
      // lose focus. Escape must originate from an enabled modal control.
      await previous.focus();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      if (language === 'it') {
        // Translation reorders the *same owner-visible* stacks, never refetching.
        await page.getByTestId('language-toggle').click();
        await expect(stack.first()).toContainText('Grove Seed');
        await inspect.first().click();
        await expect(key).toHaveText('item.grove_seed.v1');
        await expect(position).toHaveText('Item 1 of 2');
        await next.focus();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
      expect(reads).toBe(initialReads);
    });
}

for (const [width, height, language] of [
  [320, 568, 'it'], [390, 844, 'en'], [1280, 720, 'it'],
] as const) {
  test('inspection keyboard arrows browse only the owner-visible filtered list at ' + width,
    async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await signIn(page, 'inspection-keyboard-owner', language);
      let apiReads = 0;
      page.on('request', request => {
        if (/\/api\/(inventory|equipment)(\/|$)/.test(new URL(request.url()).pathname)) apiReads++;
      });
      await mockInventory(page);
      await page.goto('./#/inventory');
      const inspect = page.getByTestId('inventory-inspect');
      const dialog = page.getByTestId('inventory-inspection');
      const item = page.getByTestId('inventory-inspection-key');
      const previous = page.getByTestId('inventory-inspection-prev');
      const next = page.getByTestId('inventory-inspection-next');
      const hint = page.getByTestId('inventory-inspection-keyboard-hint');
      const position = page.getByTestId('inventory-inspection-position');
      const sorted = language === 'it'
        ? ['item.rune_shard.v1', 'item.tidal_pearl.v1', 'item.grove_seed.v1']
        : ['item.grove_seed.v1', 'item.rune_shard.v1', 'item.tidal_pearl.v1'];
      await expect(inspect).toHaveCount(3);
      const initialReads = apiReads;
      expect(initialReads).toBeGreaterThan(0);
      const opener = inspect.first();
      await opener.click();
      await expect(dialog).toBeVisible();
      await expect(hint).toContainText('← / →');
      await expect(previous).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft');
      await expect(next).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
      await expect(previous).toHaveAttribute('title', language === 'it'
        ? 'Freccia sinistra: oggetto precedente' : 'Left arrow: previous item');
      await expect(next).toHaveAttribute('title', language === 'it'
        ? 'Freccia destra: oggetto successivo' : 'Right arrow: next item');
      await expect(item).toHaveText(sorted[0]);
      await expect(previous).toBeDisabled();
      await next.focus();

      await page.keyboard.press('ArrowLeft');
      await expect(item).toHaveText(sorted[0]);
      await page.keyboard.press('ArrowRight');
      await expect(item).toHaveText(sorted[1]);
      await expect(position).toContainText('2');
      await page.keyboard.press('ArrowRight');
      await expect(item).toHaveText(sorted[2]);
      await expect(next).toBeDisabled();
      await previous.focus();
      await page.keyboard.press('ArrowRight');
      await expect(item).toHaveText(sorted[2]);
      await page.keyboard.press('ArrowLeft');
      await expect(item).toHaveText(sorted[1]);

      // A live editor inserted into the dialog owns arrow-key selection.
      await dialog.evaluate(node => {
        const editor = document.createElement('input');
        editor.setAttribute('data-testid', 'inventory-inspection-editor-fixture');
        editor.setAttribute('aria-label', 'Synthetic item editor');
        editor.value = 'abc';
        node.querySelector('[data-testid="inventory-inspection-content"]')?.appendChild(editor);
        editor.focus();
      });
      const editor = page.getByTestId('inventory-inspection-editor-fixture');
      await expect(editor).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(item).toHaveText(sorted[1]);
      await editor.evaluate(node => node.remove());
      await previous.focus();
      const blocked = await previous.evaluate(node => [
        { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
        { repeat: true }, { isComposing: true },
      ].map(flags => {
        const key = new KeyboardEvent('keydown', {
          key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true, ...flags,
        });
        node.dispatchEvent(key);
        return key.defaultPrevented;
      }));
      expect(blocked).toEqual([false, false, false, false, false, false]);
      await previous.evaluate(node => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true,
        });
        event.preventDefault();
        node.dispatchEvent(event);
      });
      await expect(item).toHaveText(sorted[1]);

      await info.attach('inventory-inspection-keyboard-' + width, {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      });
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.scrollingElement!.scrollTop === 0,
      )).toBe(true);
      await previous.focus();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(dialog).toHaveCount(0);

      // Filtering changes the keyboard deck, not the owner API snapshot.
      await page.getByTestId('inventory-browse-filter').click();
      await page.getByRole('option', { name: language === 'it' ? 'Disponibili' : 'Available' }).click();
      await expect(inspect).toHaveCount(2);
      await inspect.first().click();
      const visibleFirst = language === 'it' ? 'item.tidal_pearl.v1' : 'item.grove_seed.v1';
      const visibleSecond = language === 'it' ? 'item.grove_seed.v1' : 'item.tidal_pearl.v1';
      await expect(item).toHaveText(visibleFirst);
      await next.focus();
      await page.keyboard.press('ArrowRight');
      await expect(item).toHaveText(visibleSecond);
      await expect(next).toBeDisabled();
      await previous.focus();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(apiReads).toBe(initialReads);
    });
}

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


test('Ctrl/Meta+K finds the owner backpack from gear and history without owner API requests', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'owner-a', 'it');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  await expect(page.getByTestId('inventory-quick-find-hint')).toHaveText('Ricerca rapida: Ctrl/⌘+K');
  const search = page.getByTestId('inventory-browse-search');
  await expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K Escape');
  const unexpected: string[] = [];
  page.on('request', request => {
    if (/^\/api\/(inventory|equipment)(\/|$)/.test(new URL(request.url()).pathname))
      unexpected.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  await page.getByTestId('inventory-view-all').focus();
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await expect(page.getByTestId('inventory-view-all')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('inventory-view-gear').click();
  await expect(search).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await search.fill('Seme');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack')).toContainText('Seme del bosco');
  await info.attach('inventory-quick-find-390', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  await page.getByTestId('inventory-view-journal').click();
  await expect(search).toHaveCount(0);
  await expect(page.getByTestId('inventory-item')).toHaveCount(4);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await expect(search).toHaveValue('Seme');
  // The shortcut belongs to the inventory surface, not an actively edited
  // text field; restore focus to a non-editing control before testing Meta+K.
  await page.getByTestId('inventory-view-bag').focus();
  await expect(page.getByTestId('inventory-view-bag')).toBeFocused();
  const handledMeta = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK',
      metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(e); return e.defaultPrevented;
  });
  expect(handledMeta).toBe(true);
  await expect(search).toBeFocused();
  expect(unexpected).toEqual([]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1 &&
    document.scrollingElement!.scrollTop === 0)).toBe(true);
});

test('quick find leaves editors, dialogs, modified keys and guests in control on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-quick-find-hint')).toHaveText('Quick search: Ctrl/⌘+K');
  const search = page.getByTestId('inventory-browse-search');
  await search.fill('tidal');
  const editingHandled = await search.evaluate(input => {
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK',
      ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(editingHandled).toBe(false);
  await expect(search).toHaveValue('tidal');
  await search.fill('');
  await page.getByTestId('inventory-inspect').first().click();
  await expect(page.getByTestId('inventory-inspection')).toBeVisible();
  const dialogHandled = await page.getByTestId('inventory-inspection').evaluate(dialog => {
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK',
      ctrlKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(dialogHandled).toBe(false);
  await page.getByTestId('inventory-inspection').press('Escape');
  await expect(page.getByTestId('inventory-inspection')).toHaveCount(0);
  await page.getByTestId('inventory-view-gear').click();
  const ignored = await page.evaluate(() => [
    { shiftKey: true, ctrlKey: true }, { repeat: true, metaKey: true },
    { isComposing: true, ctrlKey: true },
  ].map(mods => {
    const e = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ...mods,
      bubbles: true, cancelable: true });
    document.dispatchEvent(e); return e.defaultPrevented;
  }));
  expect(ignored).toEqual([false, false, false]);
  await expect(page.getByTestId('inventory-view-gear')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('inventory-quick-find-hint')).toHaveText('Ricerca rapida: Ctrl/⌘+K');
  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    localStorage.removeItem('vuxo.auth.user');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(page.getByTestId('inventory-views')).toHaveCount(0);
  const guestHandled = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK',
      ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(e); return e.defaultPrevented;
  });
  expect(guestHandled).toBe(false);
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
});


test('touch quick-find remains pinned on narrow screens and reveals backpack search without APIs', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, 'owner-a', 'it');
  await mockInventory(page);
  await page.goto('./#/inventory');
  const action = page.getByTestId('inventory-quick-find-action');
  const search = page.getByTestId('inventory-browse-search');
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute('aria-label', 'Cerca oggetti');
  await expect(action).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  const ownerCalls: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/(inventory|equipment)(\/|$)/.test(path)) ownerCalls.push(request.method() + ' ' + path);
  });
  await page.getByTestId('inventory-view-journal').click();
  await expect(search).toHaveCount(0);
  await expect(action).toBeInViewport();
  await action.click();
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await search.fill('Seme');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  await expect(page.getByTestId('inventory-stack')).toContainText('Seme del bosco');
  await info.attach('inventory-touch-find-320', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  await page.getByTestId('inventory-view-gear').click();
  await expect(search).toHaveCount(0);
  await action.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('Seme');
  await expect(page.getByTestId('inventory-view-bag')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const action = document.querySelector<HTMLElement>('[data-testid="inventory-quick-find-action"]')!;
    const nav = document.querySelector<HTMLElement>('[data-testid="inventory-views"]')!;
    const a = action.getBoundingClientRect(), n = nav.getBoundingClientRect();
    return root.scrollWidth <= root.clientWidth + 1 && root.scrollHeight <= innerHeight + 1 &&
      document.scrollingElement!.scrollTop === 0 && a.right <= n.right + 1 && a.width >= 40;
  })).toBe(true);
  expect(ownerCalls).toEqual([]);
});

test('desktop quick-find responds to Enter without changing All view and follows locale', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.goto('./#/inventory');
  const button = page.getByTestId('inventory-quick-find-action');
  const search = page.getByTestId('inventory-browse-search');
  await expect(button).toHaveAttribute('aria-label', 'Search items');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inventory-view-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await page.getByTestId('language-toggle').click();
  await expect(button).toHaveAttribute('aria-label', 'Cerca oggetti');
  await page.evaluate(() => {
    localStorage.removeItem('vuxo.accessToken');
    localStorage.removeItem('vuxo.auth.user');
    localStorage.removeItem('vuxo.auth.expiresAtUtc');
    window.dispatchEvent(new Event('vuxo:session-changed'));
  });
  await expect(button).toHaveCount(0);
  await expect(page.getByTestId('inventory-auth-required')).toBeVisible();
});


test('clear-search adornment preserves owner inventory filters and input focus at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signIn(page, 'owner-a', 'it');
  await mockInventory(page);
  await page.goto('./#/inventory');
  const search = page.getByTestId('inventory-browse-search');
  const clearQuery = page.getByTestId('inventory-browse-clear-query');
  await expect(clearQuery).toHaveCount(0);
  await page.getByTestId('inventory-view-bag').click();
  await page.getByTestId('inventory-browse-filter').click();
  await page.getByRole('option', { name: 'Disponibili' }).click();
  await page.getByTestId('inventory-browse-slot').click();
  await page.getByRole('option', { name: 'Amuleto' }).click();
  await page.getByTestId('inventory-browse-sort').click();
  await page.getByRole('option', { name: 'Quantità (decrescente)' }).click();
  const ownerCalls: string[] = [];
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/(inventory|equipment)(\/|$)/.test(pathname))
      ownerCalls.push(request.method() + ' ' + pathname);
  });

  await search.fill('does-not-exist');
  await expect(page.getByTestId('inventory-browse-empty')).toBeVisible();
  await expect(clearQuery).toHaveAttribute('aria-label', 'Cancella ricerca');
  await expect(clearQuery).toBeVisible();
  await info.attach('inventory-inline-clear-search-320', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
  await clearQuery.click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(clearQuery).toHaveCount(0);
  await expect(page.getByTestId('inventory-browse-filter')).toContainText('Disponibili');
  await expect(page.getByTestId('inventory-browse-slot')).toContainText('Amuleto');
  await expect(page.getByTestId('inventory-browse-sort')).toContainText('Quantità (decrescente)');
  // Two charm stacks have owner-authorized available grants in this fixture:
  // Grove Seed (3) and Tidal Pearl (2). A query-only reset must restore
  // both rather than silently dropping the second matching stack.
  await expect(page.getByTestId('inventory-stack')).toHaveCount(2);
  await expect(page.getByTestId('inventory-stack')).toContainText([
    'Seme del bosco', 'Perla delle maree',
  ]);
  await expect(page.getByTestId('inventory-browse-clear')).toBeVisible();
  expect(ownerCalls).toEqual([]);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 &&
    document.documentElement.scrollHeight <= innerHeight + 1 &&
    document.scrollingElement!.scrollTop === 0)).toBe(true);
});

test('Escape clears only search text, keeps IME/native Escape, and localizes clear button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page, 'owner-a', 'en');
  await mockInventory(page);
  await page.goto('./#/inventory');
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const search = page.getByTestId('inventory-browse-search');
  const clearQuery = page.getByTestId('inventory-browse-clear-query');
  await search.fill('tidal');
  await expect(clearQuery).toHaveAttribute('aria-label', 'Clear search');
  await expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K Escape');
  await expect(page.getByTestId('inventory-stack')).toHaveCount(1);
  const composingPrevented = await search.evaluate(element => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true,
      bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(composingPrevented).toBe(false);
  await expect(search).toHaveValue('tidal');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(clearQuery).toHaveCount(0);
  await expect(page.getByTestId('inventory-stack')).toHaveCount(3);
  const emptyPrevented = await search.evaluate(element => {
    const event = new KeyboardEvent('keydown', { key: 'Escape',
      bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(emptyPrevented).toBe(false);

  await search.fill('Grove');
  await page.getByTestId('language-toggle').click();
  await expect(clearQuery).toHaveAttribute('aria-label', 'Cancella ricerca');
  await clearQuery.focus();
  await expect(clearQuery).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(clearQuery).toHaveCount(0);
});

