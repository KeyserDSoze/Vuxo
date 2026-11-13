import { expect, type Page, type Route } from '@playwright/test';

// Shared, synthetic-only E2E fixtures (#235). Nothing here talks to a real
// backend or OAuth provider; every mocked API write is refused.

export type Language = 'it' | 'en';
export type Theme = 'light' | 'dark';
export type Role = 'User' | 'GameMaster' | 'Administrator';

export const viewports = [
  [320, 568], [390, 844], [768, 1024], [1280, 720], [1920, 1080], [3440, 1440],
] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

/** Unsigned token: only the SPA role gate reads it; the mocked API never validates it. */
export function syntheticJwt(role: Role, exp = 4_102_444_800): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none', typ: 'JWT' }) + '.' + encode({ role, exp }) + '.e2e';
}

type PlayerOptions = {
  language?: Language;
  theme?: Theme;
  /** null keeps the visitor anonymous. */
  role?: Role | null;
  reducedMotion?: boolean;
  worldScope?: string;
};

/** Fresh preferences (and optionally a synthetic session) before every navigation. */
export async function preparePlayer(page: Page, options: PlayerOptions = {}): Promise<void> {
  const { language = 'it', theme = 'dark', role = null, worldScope = null } = options;
  const token = role ? syntheticJwt(role) : null;
  await page.addInitScript(({ language, theme, token, worldScope }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    localStorage.setItem('vuxo.theme', theme);
    if (worldScope) localStorage.setItem('vuxo.e2eWorldScope', worldScope);
    if (token) {
      localStorage.setItem('vuxo.accessToken', token);
      localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
      localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: 'e2e-owner', displayName: 'Demo Vuxian', email: null }));
    }
  }, { language, theme, token, worldScope });
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
}

type OwnerSession = {
  /** Opaque value: specs that switch accounts rely on it being distinct per owner. */
  token: string;
  userId: string;
  displayName: string;
  language?: Language;
  /** Left unset when the spec does not care about the theme. */
  theme?: Theme | 'system';
  expiresAtUtc?: string;
};

/** Stored Vuxo session for specs that mock every owner endpoint themselves. */
export async function seedOwnerSession(page: Page, session: OwnerSession): Promise<void> {
  await page.addInitScript(({ token, userId, displayName, language, theme, expiresAtUtc }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', language);
    if (theme) localStorage.setItem('vuxo.theme', theme);
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({ id: userId, displayName, email: null }));
  }, {
    token: session.token,
    userId: session.userId,
    displayName: session.displayName,
    language: session.language ?? 'it',
    theme: session.theme ?? null,
    expiresAtUtc: session.expiresAtUtc ?? '2099-01-01T00:00:00Z',
  });
}

export const appearanceCatalog = {
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

type OwnerWorld = {
  /** Inventory awards/journal entries: large values exercise in-panel scrolling. */
  awards?: number;
  /** Audit events listed on the admin dashboard. */
  events?: number;
};

const uuid = (index: number) => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');

/**
 * Deny-by-default owner API: OPTIONS 204, every write 405, known reads get
 * deterministic synthetic data and anything else 503 (pages must degrade).
 */
export async function mockOwnerApi(page: Page, world: OwnerWorld = {}): Promise<void> {
  const awardCount = world.awards ?? 3;
  const eventCount = world.events ?? 3;
  const awards = Array.from({ length: awardCount }, (_, index) => ({
    grantId: uuid(index + 1),
    itemKey: index % 2 === 0 ? 'item.rune_shard.v1' : 'item.grove_seed.v1',
    quantity: 1,
    awardedAtUtc: new Date(Date.UTC(2026, 10, 1, 10, index)).toISOString(),
    consumed: index % 5 === 0,
  }));
  const stacks = ['item.rune_shard.v1', 'item.grove_seed.v1'].map(itemKey => {
    const owned = awards.filter(award => award.itemKey === itemKey);
    return { itemKey, quantity: owned.length, equippedQuantity: 0, availableGrantIds: owned.map(award => award.grantId) };
  }).filter(stack => stack.quantity > 0);
  const events = Array.from({ length: eventCount }, (_, index) => ({
    eventId: uuid(1000 + index),
    eventType: index % 2 === 0 ? 'exclusive_content.granted' : 'world.player.connected',
    visibilityScope: 'player',
    playerId: 'player-' + index,
    correlationId: uuid(2000 + index),
    causationId: null,
    ruleVersion: 'audit-v1',
    occurredAtUtc: new Date(Date.UTC(2026, 10, 2, 9, index)).toISOString(),
  }));

  const reads: Record<string, unknown> = {
    '/api/auth/providers': {
      microsoft: { enabled: true, clientId: 'e2e-microsoft-client', tenantId: 'consumers' },
      google: { enabled: false, clientId: null },
    },
    '/api/meta/character-appearance': appearanceCatalog,
    '/api/meta/version': {
      application: 'Vuxo.Api', version: '0.0.1', informationalVersion: '0.0.1+' + 'f'.repeat(40),
      commit: 'f'.repeat(40), buildDateUtc: '2026-11-12T00:00:00Z', environment: 'E2E',
    },
    '/api/characters/me/health': { name: 'Demo Vuxian', currentHealth: 14, maxHealth: 20, rulesVersion: 'character-health-v1' },
    '/api/characters/me/encounter': { active: false, portalGrantId: null, expiresAtUtc: null },
    '/api/inventory': awards,
    '/api/inventory/stacks': stacks,
    '/api/equipment': { items: [], stats: null, ruleVersion: 'equipment-v1' },
    '/api/personal-content': [{ id: uuid(9001), contentKey: 'portal.memory.grove', portalKey: 'challenge.sequence.v1', expiresAtUtc: null }],
    '/api/personal-content/world-portals': [],
    '/api/admin/audit/events': { total: eventCount, offset: 0, limit: 20, items: events.slice(0, 20) },
    '/api/admin/online-players': { players: [{ playerId: 'player-online-' + 'x'.repeat(24), characterName: 'Moon Wanderer', x: 3.5, y: 4.5 }] },
    '/api/admin/observability': { enabled: true, exporterConfigured: true, dashboardUrl: null },
  };

  await page.route('**/api/**', (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.method() !== 'GET') return route.fulfill({ status: 405, headers: cors });
    // An owner without a saved Vuxian: the editor opens in creation mode.
    if (path === '/api/characters/me/appearance') return route.fulfill({ status: 404, headers: cors });
    if (path in reads) return route.fulfill({ json: reads[path], headers: cors });
    return route.fulfill({ status: 503, headers: cors });
  });
}

/**
 * Proves the absence of change: fails the moment `attribute` of the element matching `selector`
 * differs from its starting value, passes if it stays untouched for `quietMs`. The watch runs in the
 * page and re-resolves the element on every DOM mutation, so React re-mounts cannot hide a change.
 */
export async function expectAttributeQuiet(page: Page, selector: string, attribute: string, quietMs = 250): Promise<void> {
  const changed = await page.evaluate(({ selector, attribute, quietMs }) => new Promise<boolean>(resolve => {
    const read = () => document.querySelector(selector)?.getAttribute(attribute) ?? null;
    const initial = read();
    const timer = window.setTimeout(() => { observer.disconnect(); resolve(false); }, quietMs);
    const observer = new MutationObserver(() => {
      if (read() === initial) return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  }), { selector, attribute, quietMs });
  expect(changed, attribute + ' must not change for ' + quietMs + 'ms').toBe(false);
}

/** Resolves with the attribute value once it has stopped changing for `quietMs` (e.g. a stopped avatar). */
export async function settledAttribute(page: Page, selector: string, attribute: string, quietMs = 150, timeoutMs = 5_000): Promise<string | null> {
  return page.evaluate(({ selector, attribute, quietMs, timeoutMs }) => new Promise<string | null>((resolve, reject) => {
    const read = () => document.querySelector(selector)?.getAttribute(attribute) ?? null;
    let last = read();
    let quiet = window.setTimeout(done, quietMs);
    const limit = window.setTimeout(() => { observer.disconnect(); reject(new Error(attribute + ' never settled')); }, timeoutMs);
    function done() {
      observer.disconnect();
      window.clearTimeout(limit);
      resolve(read());
    }
    const observer = new MutationObserver(() => {
      const current = read();
      if (current === last) return;
      last = current;
      window.clearTimeout(quiet);
      quiet = window.setTimeout(done, quietMs);
    });
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  }), { selector, attribute, quietMs, timeoutMs });
}
/**
 * Like `expectAttributeQuiet`, for attributes holding JSON (renderer diagnostics): only the listed
 * dotted paths (e.g. `haloAlphas.1`) are compared, so unrelated animated fields cannot cause a false failure.
 */
export async function expectJsonFieldsQuiet(page: Page, selector: string, attribute: string, fields: string[], quietMs = 250): Promise<void> {
  const changed = await page.evaluate(({ selector, attribute, fields, quietMs }) => new Promise<boolean>(resolve => {
    const read = () => {
      const raw = document.querySelector(selector)?.getAttribute(attribute);
      const parsed = raw ? JSON.parse(raw) as unknown : {};
      return JSON.stringify(fields.map(path =>
        path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], parsed)));
    };
    const initial = read();
    const timer = window.setTimeout(() => { observer.disconnect(); resolve(false); }, quietMs);
    const observer = new MutationObserver(() => {
      if (read() === initial) return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  }), { selector, attribute, fields, quietMs });
  expect(changed, fields.join(',') + ' must not change for ' + quietMs + 'ms').toBe(false);
}

/** Runs `action` and proves no request matching `url` was issued while it ran or within `windowMs` after. */
export async function expectNoRequestDuring(
  page: Page, url: RegExp, windowMs: number, action: () => Promise<unknown> = async () => undefined,
  method?: string,
): Promise<void> {
  const watcher = page.waitForRequest(
    request => url.test(request.url()) && (!method || request.method() === method),
    { timeout: windowMs },
  ).then(() => 'request', () => 'none');
  await action();
  expect(await watcher, 'no request matching ' + url + ' expected').toBe('none');
}

/** The one-page contract: the document can neither overflow nor move. */
export async function expectNoDocumentScroll(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector('[data-testid="app-shell"]')?.getBoundingClientRect();
    return root.scrollHeight <= innerHeight + 1
      && root.scrollWidth <= root.clientWidth + 1
      && document.body.scrollHeight <= innerHeight + 1
      && Boolean(shell) && Math.abs(shell!.top) <= 1 && Math.abs(shell!.bottom - innerHeight) <= 1;
  }), { message: 'document must fit the viewport' }).toBe(true);
  // Programmatic and keyboard scroll attempts must leave the page in place.
  await page.evaluate(() => window.scrollTo(0, 10_000));
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => window.scrollY + (document.scrollingElement?.scrollTop ?? 0)),
    { message: 'document scroll position must stay at 0' }).toBe(0);
}

/** Deck screens: the only scroller is the panel, which never hides horizontal overflow. */
export async function expectBoundedDeckPanel(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const deck = document.querySelector('[data-testid="game-deck"]')?.getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>('[data-testid="game-deck-scroll"]');
    if (!deck || !panel) return 'missing deck';
    if (deck.bottom > innerHeight + 1 || deck.right > innerWidth + 1) return 'deck outside viewport';
    if (getComputedStyle(panel).overflowY !== 'auto') return 'panel not scrollable';
    if (panel.clientHeight <= 0) return 'panel collapsed';
    return panel.scrollWidth <= panel.clientWidth + 1 ? 'ok' : 'hidden horizontal overflow ' + panel.scrollWidth + '>' + panel.clientWidth;
  })).toBe('ok');
}
