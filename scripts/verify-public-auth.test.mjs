import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicAuth } from './verify-public-auth.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const origin = 'https://vuxo.quest';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' };
const res = (body, status = 200, headers = {}) => new Response(body, { status, headers });

function fixture(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method ?? 'GET', origin: options.headers?.Origin,
      authorization: options.headers?.Authorization ?? options.headers?.authorization ?? null,
      cookie: options.headers?.Cookie ?? options.headers?.cookie ?? null });
    if (path in overrides) {
      return typeof overrides[path] === 'function' ? overrides[path](url, options) : overrides[path];
    }
    if (path === '/health') return res('Healthy');
    if (path === '/api/meta/version') return res(JSON.stringify({ commit }), 200, { 'Content-Type': 'application/json' });
    if (path === '/api/auth/providers') return res(JSON.stringify({
      microsoft: { enabled: true, clientId: 'public-ms-id', tenantId: 'consumers' },
      google: { enabled: true, clientId: 'public-google-id' },
    }), 200, cors);
    if (path === '/api/auth/social') return res(null, 204, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type',
    });
    if (path.startsWith('/api/personal-content/history/')) {
      if ((options.method ?? 'GET') === 'OPTIONS') {
        return res(null, 204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'authorization',
        });
      }
      return res(null, 401, cors);
    }
    if (path === '/redirect.html') return res(
      '<title>Vuxo Microsoft sign-in</title><script type="module" src="/assets/redirect-abc123.js"></script>',
      200, { 'Content-Type': 'text/html' });
    throw new Error('Unexpected route');
  };
  return { calls, fetcher };
}
async function rejects(overrides, pattern) {
  const { fetcher } = fixture(overrides);
  await assert.rejects(() => verifyPublicAuth({ expectedCommit: commit, fetcher, attempts: 1 }), pattern);
}

test('valid public endpoints, commit, providers, preflight and bridge', async () => {
  const { calls, fetcher } = fixture();
  await verifyPublicAuth({ expectedCommit: commit, fetcher, attempts: 1 });
  assert.deepEqual(calls.map(x => x.path), [
    '/health', '/api/meta/version', '/api/auth/providers', '/api/auth/social',
    '/api/personal-content/history/completed', '/api/personal-content/history/completed',
    '/api/personal-content/history/outcomes', '/api/personal-content/history/outcomes',
    '/redirect.html',
  ]);
  assert.equal(calls[2].origin, origin);
  assert.equal(calls[3].method, 'OPTIONS');
  for (const i of [4, 6]) {
    assert.equal(calls[i].method, 'GET');
    assert.equal(calls[i].origin, origin);
    assert.equal(calls[i].authorization, null);
    assert.equal(calls[i].cookie, null);
    assert.equal(calls[i + 1].authorization, null);
    assert.equal(calls[i + 1].cookie, null);
    assert.equal(calls[i + 1].method, 'OPTIONS');
    assert.equal(calls[i + 1].origin, origin);
  }
});
test('invalid commit rejected before requests', async () => {
  const { calls, fetcher } = fixture();
  await assert.rejects(() => verifyPublicAuth({ expectedCommit: 'main', fetcher }), /deployment commit SHA/);
  assert.equal(calls.length, 0);
});
test('stale API commit fails', async () => {
  await rejects({ '/api/meta/version': res(JSON.stringify({ commit: 'old' })) }, /version: wrong deployed commit/);
});
test('disabled Google is rejected, no Client ID in logs', async () => {
  const body = JSON.stringify({ microsoft: { enabled: true, clientId: 'ms', tenantId: 'consumers' },
    google: { enabled: false, clientId: 'PRIVATE-ID' } });
  const { fetcher } = fixture({ '/api/auth/providers': res(body, 200, cors) });
  await assert.rejects(() => verifyPublicAuth({ expectedCommit: commit, fetcher, attempts: 1 }),
    error => /google: provider is not enabled/.test(error.message) && !error.message.includes('PRIVATE-ID'));
});
test('non-consumer Microsoft tenant is rejected in production', async () => {
  await rejects({ '/api/auth/providers': res(JSON.stringify({
    microsoft: { enabled: true, clientId: 'public-ms-id', tenantId: 'common' },
    google: { enabled: true, clientId: 'public-google-id' },
  }), 200, cors) }, /microsoft: production must use personal accounts only/);
});
test('Microsoft tenant required', async () => {
  await rejects({ '/api/auth/providers': res(JSON.stringify({
    microsoft: { enabled: true, clientId: 'id' }, google: { enabled: true, clientId: 'id' },
  }), 200, cors) }, /microsoft: missing tenantId/);
});
test('provider GET rejects incorrect CORS', async () => {
  await rejects({ '/api/auth/providers': res('{}', 200, { 'Content-Type': 'application/json' }) }, /providers: production CORS origin/);
});
test('legacy vuxo.app response is rejected by the canonical quest browser origin', async () => {
  await rejects({ '/api/auth/providers': res('{}', 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://vuxo.app',
    'Access-Control-Allow-Credentials': 'true',
  }) }, /providers: production CORS origin/);
});
test('preflight blocked at edge fails', async () => {
  await rejects({ '/api/auth/social': res(null, 403) }, /preflight: wrong HTTP status/);
});
test('preflight requires Content-Type', async () => {
  await rejects({ '/api/auth/social': res(null, 204, {
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST',
  }) }, /preflight: Content-Type not authorized/);
});
test('Pages SPA fallback is not accepted as redirect bridge', async () => {
  await rejects({ '/redirect.html': res('<title>Vuxo</title><div id="root"></div>', 200,
    { 'Content-Type': 'text/html' }) }, /Microsoft redirect bridge: missing/);
});
test('transient failure is retried, then succeeds', async () => {
  const { fetcher: base } = fixture();
  let failed = false, retries = 0;
  await verifyPublicAuth({
    expectedCommit: commit, attempts: 2, retryDelayMs: 1,
    sleep: async () => { retries += 1; },
    fetcher: async (url, options) => {
      if (!failed && url.endsWith('/health')) { failed = true; throw new Error('transient'); }
      return base(url, options);
    },
  });
  assert.equal(retries, 1);
});
test('unknown network failure is redacted after retries', async () => {
  const { fetcher } = fixture({ '/health': () => { throw new Error('PRIVATE-TOKEN'); } });
  await assert.rejects(() => verifyPublicAuth({
    expectedCommit: commit, fetcher, attempts: 2, sleep: async () => {},
  }), error => /network, response or timeout error/.test(error.message) && !error.message.includes('PRIVATE-TOKEN'));
});

test('private history endpoints reject anonymous success and HTML fallback', async () => {
  for (const route of ['/api/personal-content/history/completed',
    '/api/personal-content/history/outcomes']) {
    await rejects({ [route]: res('[]', 200, cors) },
      /history: (completed|outcomes): anonymous GET must return HTTP 401/);
    await rejects({ [route]: res('not found', 404, cors) },
      /history: (completed|outcomes): anonymous GET must return HTTP 401/);
    await rejects({ [route]: res(null, 302, { Location: '/login' }) },
      /history: (completed|outcomes): anonymous GET must return HTTP 401/);
  }
});
test('private history 401 must still use canonical browser CORS', async () => {
  await rejects({ '/api/personal-content/history/completed': res(null, 401, {
    'Access-Control-Allow-Origin': 'https://vuxo.app',
    'Access-Control-Allow-Credentials': 'true',
  }) }, /history: completed: production CORS origin mismatch/);
  await rejects({ '/api/personal-content/history/outcomes': res(null, 401, {
    'Access-Control-Allow-Origin': origin,
  }) }, /history: outcomes: CORS credentials missing/);
});
test('private history preflight requires authorized GET and Authorization header', async () => {
  const route = '/api/personal-content/history/outcomes';
  for (const custom of [
    res(null, 403),
    res(null, 204, { ...cors, 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'authorization' }),
    res(null, 204, { ...cors, 'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'content-type' }),
  ]) {
    const { fetcher } = fixture({ [route]: (_url, options) =>
      options.method === 'OPTIONS' ? custom : res(null, 401, cors) });
    await assert.rejects(() => verifyPublicAuth({
      expectedCommit: commit, fetcher, attempts: 1,
    }), /history: outcomes: (preflight status|preflight GET|preflight Authorization)/);
  }
});
test('private history probes never send credentials or tokens, and failures are safely redacted', async () => {
  const { calls, fetcher } = fixture();
  await verifyPublicAuth({ expectedCommit: commit, fetcher, attempts: 1 });
  const history = calls.filter(call => call.path.includes('/history/'));
  assert.equal(history.length, 4);
  assert.deepEqual(history.map(call => call.method), ['GET', 'OPTIONS', 'GET', 'OPTIONS']);
  assert.ok(history.every(call => !call.authorization && !call.cookie));
  await rejects({ '/api/personal-content/history/completed': () => {
    throw new Error('SECRET_PLAYER_TOKEN');
  } }, /Public authentication check failed: network, response or timeout error/);
});
