import { expect, test, type Page } from '@playwright/test';

// On-demand evidence only; the normal 273+ test CI suite is not expanded.
// Every owner response is synthetic and no real login or backend is used.
const sizes = [[320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440]] as const;
const variants = [{ language: 'it', theme: 'light' }, { language: 'en', theme: 'dark' }] as const;
const screens = [
  { name: 'home', route: '/', ready: 'home-screen', owner: false },
  { name: 'world', route: '/game', ready: 'game-canvas', owner: false },
  { name: 'refuge', route: '/refuge', ready: 'refuge-command-health', owner: true },
  { name: 'inventory', route: '/inventory', ready: 'inventory-stack-grid', owner: true },
  { name: 'character', route: '/character', ready: 'character-studio-portrait', owner: false },
  { name: 'portals', route: '/portals', ready: 'portal-console-gateway', owner: true },
] as const;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const grantId = '11111111-1111-4111-8111-111111111111';
const seedId = '22222222-2222-4222-8222-222222222222';
const catalog = {
  catalogVersion: '0.0.1',
  hairStyles: ['hair-1', 'hair-2', 'hair-3', 'hair-4'],
  hairColors: ['black', 'brown', 'blonde', 'red', 'blue'],
  faces: ['face-1', 'face-2', 'face-3'],
  bodyTypes: ['body-1', 'body-2', 'body-3'],
  skinTones: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
  topColors: ['blue', 'red', 'green', 'black', 'white'],
  bottomStyles: ['shorts', 'skirt'],
  bottomColors: ['black', 'blue', 'red', 'green', 'white'],
  shoeStyles: ['shoe-1', 'shoe-2', 'shoe-3'],
  shoeColors: ['white', 'black', 'brown', 'red', 'blue'],
};

async function mockDemoApi(page: Page) {
  // Deny all unknown API reads and ALL API writes; do not leak any real user data.
  await page.route('**/api/**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() !== 'GET') return route.fulfill({ status: 405, headers: cors });
    if (path === '/api/meta/character-appearance') return route.fulfill({ json: catalog, headers: cors });
    if (path === '/api/characters/me/health') return route.fulfill({
      json: { name: 'Vuxian Demo', currentHealth: 7, maxHealth: 20, rulesVersion: 'character-health-v1' }, headers: cors,
    });
    if (path === '/api/characters/me/encounter') return route.fulfill({
      json: { active: false, portalGrantId: null, expiresAtUtc: null }, headers: cors,
    });
    if (path === '/api/inventory') return route.fulfill({ json: [
      { grantId, itemKey: 'item.rune_shard.v1', quantity: 1, awardedAtUtc: '2026-11-03T10:00:00Z' },
      { grantId: seedId, itemKey: 'item.grove_seed.v1', quantity: 3, awardedAtUtc: '2026-11-02T10:00:00Z' },
    ], headers: cors });
    if (path === '/api/inventory/stacks') return route.fulfill({ json: [
      { itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 1, availableGrantIds: [] },
      { itemKey: 'item.grove_seed.v1', quantity: 3, equippedQuantity: 0, availableGrantIds: [seedId] },
    ], headers: cors });
    if (path === '/api/equipment') return route.fulfill({ json: {
      items: [{ slot: 'relic', grantId, itemKey: 'item.rune_shard.v1', equippedAtUtc: '2026-11-03T11:00:00Z' }],
      stats: null, ruleVersion: 'equipment-v1',
    }, headers: cors });
    if (path === '/api/personal-content') return route.fulfill({ json: [
      { id: grantId, contentKey: 'portal.memory.grove', portalKey: 'challenge.sequence.v1', expiresAtUtc: null },
    ], headers: cors });
    if (path.endsWith('/challenge')) return route.fulfill({ json: {
      grantId, version: 'portal-sequence-v1', sequence: ['sun', 'moon', 'star', 'wave'],
    }, headers: cors });
    return route.fulfill({ status: 503, headers: cors });
  });
}

async function prepare(page: Page, language: 'it' | 'en', theme: 'light' | 'dark', owner: boolean, world: boolean) {
  await page.addInitScript(({ language, theme, owner, world }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.theme', theme);
    if (world) {
      localStorage.setItem('vuxo.e2ePlayerId', 'visual-art-self');
      localStorage.setItem('vuxo.e2eWorldScope', 'visual-review');
      localStorage.setItem('vuxo.e2eCharacterName', 'Visual Wanderer');
    }
    if (owner) {
      localStorage.setItem('vuxo.accessToken', 'visual-qa-synthetic-owner');
      localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
      localStorage.setItem('vuxo.auth.user', JSON.stringify({
        id: 'visual-qa-only', displayName: 'Demo Vuxian', email: null,
      }));
    }
  }, { language, theme, owner, world });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockDemoApi(page);
}

if (process.env.VUXO_VISUAL_REVIEW === '1') {
  test.describe('viewport evidence for UX #165', () => {
    test.setTimeout(60_000);
    for (const variant of variants) {
      for (const [width, height] of sizes) {
        for (const screen of screens) {
          test(screen.name + ' ' + variant.language + '-' + variant.theme + ' ' + width + 'x' + height,
            async ({ page, request }, info) => {
              await page.setViewportSize({ width, height });
              await prepare(page, variant.language, variant.theme, screen.owner, screen.name === 'world');
              if (screen.name === 'world') {
                // Reset and seed ONLY the local Vite E2E world. Run serially:
                // its in-memory two-player scene is shared by browser contexts.
                const reset = await request.post('http://127.0.0.1:4173/__vuxo_e2e/world/reset?scope=visual-review');
                expect(reset.ok()).toBe(true);
                // Preview-only server fixtures: these saved cosmetics must
                // come from the world state, not from the browser rendering them.
                const fixtures = [
                  {
                    playerId: 'visual-art-peer',
                    characterName: 'Moon Wanderer',
                    appearance: { catalogVersion: '0.0.1', hairStyle: 'hair-2',
                      hairColor: 'blonde', face: 'face-2', bodyType: 'body-3',
                      skinTone: 'skin-5', topColor: 'red', bottomStyle: 'shorts',
                      bottomColor: 'black', shoeStyle: 'shoe-1', shoeColor: 'white' },
                  },
                  {
                    playerId: 'visual-art-self',
                    characterName: 'Visual Wanderer',
                    appearance: { catalogVersion: '0.0.1', hairStyle: 'hair-4',
                      hairColor: 'red', face: 'face-3', bodyType: 'body-1',
                      skinTone: 'skin-3', topColor: 'green', bottomStyle: 'skirt',
                      bottomColor: 'white', shoeStyle: 'shoe-2', shoeColor: 'blue' },
                  },
                ];
                for (const fixture of fixtures) {
                  const seeded = await request.post('http://127.0.0.1:4173/__vuxo_e2e/world/join?scope=visual-review', {
                    data: fixture,
                  });
                  expect(seeded.ok()).toBe(true);
                }
              }
              await page.goto('./#' + screen.route);
              await expect(page.getByTestId(screen.ready).first()).toBeVisible();
              await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme))
                .toBe(variant.theme);
              if (screen.name === 'world') {
                await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected');
                await expect(page.getByTestId('world-presence')).toContainText('Visual Wanderer');
                await expect(page.getByTestId('world-presence')).toContainText('Moon Wanderer');
                await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-e2e-illustrated-player-count', '2');
                await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-e2e-world-art-version', 'vuxo-world-art-v1');
                await expect.poll(() => page.evaluate(() => {
                  const encoded = document.querySelector('[data-testid="game-canvas"]')
                    ?.getAttribute('data-e2e-avatar-appearance');
                  if (!encoded) return false;
                  const entries = JSON.parse(encoded) as Array<{ playerId: string; appearance: string }>;
                  const self = entries.find(entry => entry.playerId === 'visual-art-self');
                  const peer = entries.find(entry => entry.playerId === 'visual-art-peer');
                  return Boolean(entries.length === 2
                    && self?.appearance.includes('"hairColor":"red"')
                    && self?.appearance.includes('"topColor":"green"')
                    && self?.appearance.includes('"bottomStyle":"skirt"')
                    && peer?.appearance.includes('"hairColor":"blonde"')
                    && peer?.appearance.includes('"skinTone":"skin-5"'));
                })).toBe(true);
                await expect.poll(() => page.evaluate(() => {
                  const encoded = document.querySelector('[data-testid="game-canvas"]')
                    ?.getAttribute('data-e2e-name-label-bounds');
                  if (!encoded) return false;
                  const labels = JSON.parse(encoded) as Array<{
                    left: number; right: number; top: number; bottom: number
                  }>;
                  return labels.length === 2 && labels.every((a, index) =>
                    labels.slice(index + 1).every(b =>
                      a.right + 5 <= b.left || b.right + 5 <= a.left ||
                      a.bottom + 5 <= b.top || b.bottom + 5 <= a.top));
                })).toBe(true);
                await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
                await expect.poll(() => page.evaluate(() => {
                  const host = document.querySelector('[data-testid="game-canvas"]');
                  const canvas = host?.querySelector('canvas');
                  if (!host || !canvas) return false;
                  const a = host.getBoundingClientRect();
                  const b = canvas.getBoundingClientRect();
                  return Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
                })).toBe(true);
              }
              if (screen.owner) await expect(page.getByTestId('game-deck-scroll')).toBeVisible();
              await expect.poll(() => page.evaluate(() => {
                const root = document.documentElement;
                return root.scrollWidth <= root.clientWidth + 1
                  && root.scrollHeight <= window.innerHeight + 1
                  && document.scrollingElement?.scrollTop === 0;
              })).toBe(true);
              await page.evaluate(() => document.fonts.ready);
              const screenshot = info.outputPath('viewport.png');
              await page.screenshot({ path: screenshot, animations: 'disabled' });
              await info.attach('viewport', { path: screenshot, contentType: 'image/png' });
              const metrics = await page.evaluate(() => ({
                viewport: { width: innerWidth, height: innerHeight },
                document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
                theme: document.documentElement.dataset.theme,
                fullscreen: Boolean(document.fullscreenElement),
              }));
              await info.attach('metrics', {
                body: JSON.stringify({ scene: screen.name, variant, metrics }, null, 2),
                contentType: 'application/json',
              });

              // Additional visual states: client-only actions, no server mutations.
              if ((width === 390 || width === 1280) && screen.name === 'refuge') {
                const focused = page.getByTestId('refuge-focus-toggle');
                await focused.click();
                await expect(focused).toHaveAttribute('aria-pressed', 'true');
                await page.getByTestId('refuge-jump-preparation').click();
                await expect(page.getByTestId('refuge-preparation')).toBeFocused();
                await expect(page.getByTestId('refuge-command-hero')).toBeHidden();
                await expect.poll(() => page.evaluate(() =>
                  document.documentElement.scrollHeight <= innerHeight + 1
                  && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                const focusFile = info.outputPath('refuge-focused-preparation.png');
                await page.screenshot({ path: focusFile, animations: 'disabled' });
                await info.attach('refuge-focused-preparation', { path: focusFile, contentType: 'image/png' });
              }
              if ((width === 390 || width === 1280) && screen.name === 'inventory') {
                await page.getByTestId('inventory-inspect').first().click();
                await expect(page.getByRole('dialog')).toBeVisible();
                const file = info.outputPath('inspection.png');
                await page.screenshot({ path: file, animations: 'disabled' });
                await info.attach('inventory-inspection', { path: file, contentType: 'image/png' });
                await page.getByRole('dialog').press('Escape');
                await expect(page.getByRole('dialog')).toHaveCount(0);
                // Additional owner-only game views: the authoritative awards
                // and loadout are already served by synthetic GET fixtures.
                for (const mode of ['gear', 'bag', 'journal'] as const) {
                  await page.getByTestId('inventory-view-' + mode).click();
                  await expect(page.getByTestId('inventory-view-' + mode))
                    .toHaveAttribute('aria-pressed', 'true');
                  await expect.poll(() => page.evaluate(() =>
                    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
                    && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
                  const stateFile = info.outputPath('inventory-' + mode + '.png');
                  await page.screenshot({ path: stateFile, animations: 'disabled' });
                  await info.attach('inventory-' + mode,
                    { path: stateFile, contentType: 'image/png' });
                }
              }
              if ((width === 390 || width === 1280) && screen.name === 'portals') {
                await page.getByTestId('portal-start').first().click();
                await expect(page.getByTestId('portal-challenge')).toBeVisible();
                const file = info.outputPath('portal-preview.png');
                await page.screenshot({ path: file, animations: 'disabled' });
                await info.attach('portal-preview', { path: file, contentType: 'image/png' });
                // Capture the playable keyboard state without making a real
                // submission or using any user-owned credentials.
                await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });
                const arena = page.getByTestId('portal-challenge');
                await expect(arena).toBeFocused();
                await expect(page.getByTestId('portal-keyboard-hint')).toBeVisible();
                await page.keyboard.press('1');
                await expect(page.getByTestId('portal-progress')).toBeVisible();
                const answerFile = info.outputPath('portal-keyboard-answer.png');
                await page.screenshot({ path: answerFile, animations: 'disabled' });
                await info.attach('portal-keyboard-answer', { path: answerFile, contentType: 'image/png' });
              }
            });
        }
      }
    }
    // A dedicated owner-safe visual scene verifies the actual compass HUD.
    // The regular world matrix remains guest-only; this fixture is local and
    // never contacts production or requests a real OAuth login.
    for (const [width, height] of [[390, 844], [1280, 720]] as const) {
      test('private portal compass IT-dark ' + width + 'x' + height,
        async ({ page, request }, info) => {
          await page.setViewportSize({ width, height });
          await prepare(page, 'it', 'dark', true, true);
          await page.route('**/api/personal-content/world-portals', route => route.fulfill({
            json: [{ id: grantId, contentKey: 'portal.grove', x: 18.5, y: 4.5 }],
            headers: cors,
          }));
          const reset = await request.post(
            'http://127.0.0.1:4173/__vuxo_e2e/world/reset?scope=visual-review');
          expect(reset.ok()).toBe(true);
          await page.goto('./#/game');
          await expect(page.getByTestId('world-connection-status'))
            .toHaveAttribute('data-status', 'connected');
          const compass = page.getByTestId('world-portal-compass');
          await expect(compass).toHaveAttribute('data-direction', 'e');
          await expect(compass).toContainText('14 caselle');
          await expect(compass).toBeInViewport();
          const radar = page.getByTestId('world-radar');
          await expect(radar).toBeVisible();
          if (width === 390) {
            await expect(radar).toHaveAttribute('data-expanded', 'false');
            await page.getByTestId('world-radar-toggle').click();
          }
          await expect(page.getByTestId('world-radar-chart')).toBeInViewport();
          await expect(page.getByTestId('world-radar-portal')).toHaveAttribute('data-at-edge', 'true');
          await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
          await expect.poll(() => page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
            && document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
          const screenshot = info.outputPath('owner-compass.png');
          await page.screenshot({ path: screenshot, animations: 'disabled' });
          await info.attach('owner-portal-compass', { path: screenshot, contentType: 'image/png' });
        });
    }
  });
}
