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
    calls.push({ path, method: options.method ?? 'GET', origin: options.headers?.Origin });
    if (path in overrides) {
      return typeof overrides[path] === 'function' ? overrides[path](url, options) : overrides[path];
    }
    if (path === '/health') return res('Healthy');
    if (path === '/api/meta/version') return res(JSON.stringify({ commit }), 200, { 'Content-Type': 'application/json' });
    if (path === '/api/auth/providers') return res(JSON.stringify({
      microsoft: { enabled: true, clientId: 'public-ms-id', tenantId: 'common' },
      google: { enabled: true, clientId: 'public-google-id' },
    }), 200, cors);
    if (path === '/api/auth/social') return res(null, 204, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type',
    });
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
    '/health', '/api/meta/version', '/api/auth/providers', '/api/auth/social', '/redirect.html',
  ]);
  assert.equal(calls[2].origin, origin);
  assert.equal(calls[3].method, 'OPTIONS');
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
  const body = JSON.stringify({ microsoft: { enabled: true, clientId: 'ms', tenantId: 'common' },
    google: { enabled: false, clientId: 'PRIVATE-ID' } });
  const { fetcher } = fixture({ '/api/auth/providers': res(body, 200, cors) });
  await assert.rejects(() => verifyPublicAuth({ expectedCommit: commit, fetcher, attempts: 1 }),
    error => /google: provider is not enabled/.test(error.message) && !error.message.includes('PRIVATE-ID'));
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
