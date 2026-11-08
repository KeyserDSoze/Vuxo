#!/usr/bin/env node
/**
 * Read-only public production auth smoke. No OAuth tokens or private credentials.
 * Do not print provider Client IDs or raw upstream response bodies in diagnostics.
 */
import { pathToFileURL } from 'node:url';

const API = 'https://api.vuxoapi.xyz';
const WEB = 'https://vuxo.quest';

function requireOk(response, context) {
  if (response.status !== 200) throw new Error(context + ': expected HTTP 200');
}
function requireCors(response, context) {
  if (response.headers.get('access-control-allow-origin') !== WEB) {
    throw new Error(context + ': production CORS origin mismatch');
  }
  if (response.headers.get('access-control-allow-credentials')?.toLowerCase() !== 'true') {
    throw new Error(context + ': CORS credentials missing');
  }
}
function requireProvider(provider, name, fields) {
  if (!provider || typeof provider !== 'object' || provider.enabled !== true) {
    throw new Error(name + ': provider is not enabled');
  }
  for (const field of fields) {
    if (typeof provider[field] !== 'string' || !provider[field].trim()) {
      throw new Error(name + ': missing ' + field);
    }
  }
}
async function checkOnce(fetcher, expectedCommit) {
  const get = (path, options = {}) => fetcher(path, {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(8000),
  });

  const health = await get(API + '/health');
  requireOk(health, 'health');
  if ((await health.text()).trim() !== 'Healthy') throw new Error('health: unexpected response');

  const version = await get(API + '/api/meta/version');
  requireOk(version, 'version');
  const metadata = await version.json();
  if (metadata?.commit !== expectedCommit) throw new Error('version: wrong deployed commit');

  const discovery = await get(API + '/api/auth/providers', { headers: { Origin: WEB } });
  requireOk(discovery, 'providers');
  requireCors(discovery, 'providers');
  if (!discovery.headers.get('content-type')?.includes('application/json')) {
    throw new Error('providers: response is not JSON');
  }
  const providers = await discovery.json();
  requireProvider(providers?.microsoft, 'microsoft', ['clientId', 'tenantId']);
  if (providers.microsoft.tenantId !== 'consumers') {
    throw new Error('microsoft: production must use personal accounts only');
  }
  requireProvider(providers?.google, 'google', ['clientId']);

  const preflight = await get(API + '/api/auth/social', {
    method: 'OPTIONS',
    headers: {
      Origin: WEB,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  if (![200, 204].includes(preflight.status)) throw new Error('preflight: wrong HTTP status');
  requireCors(preflight, 'preflight');
  const methods = (preflight.headers.get('access-control-allow-methods') ?? '').toUpperCase().split(',').map(x => x.trim());
  const headers = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(',').map(x => x.trim());
  if (!methods.includes('POST')) throw new Error('preflight: POST not authorized');
  if (!headers.includes('content-type') && !headers.includes('*')) {
    throw new Error('preflight: Content-Type not authorized');
  }

  const bridge = await get(WEB + '/redirect.html');
  requireOk(bridge, 'Microsoft redirect bridge');
  if (!bridge.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Microsoft redirect bridge: not HTML');
  }
  const html = await bridge.text();
  if (!/<title>\s*Vuxo Microsoft sign-in\s*<\/title>/i.test(html)
      || /id=["']root["']/.test(html)
      || !/<script\b[^>]*\bsrc=["']\/assets\/[^"']+\.js["'][^>]*>/i.test(html)) {
    throw new Error('Microsoft redirect bridge: missing standalone JS entry');
  }
}
export async function verifyPublicAuth({
  expectedCommit, fetcher = fetch, attempts = 5,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), retryDelayMs = 4000,
} = {}) {
  if (typeof expectedCommit !== 'string' || !/^[a-f0-9]{40}$/.test(expectedCommit)) {
    throw new Error('Invalid expected full deployment commit SHA');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error('Invalid public smoke retry count');
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkOnce(fetcher, expectedCommit);
      return;
    } catch (error) {
      if (attempt === attempts) {
        const message = error instanceof Error && /^(health|version|providers|google|microsoft|preflight|Microsoft redirect bridge):/.test(error.message)
          ? error.message : 'network, response or timeout error';
        throw new Error('Public authentication check failed: ' + message);
      }
      await sleep(retryDelayMs);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyPublicAuth({ expectedCommit: process.env.VUXO_EXPECTED_COMMIT })
    .then(() => console.log('PASS public health, commit, providers, CORS preflight, MSAL bridge'))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
