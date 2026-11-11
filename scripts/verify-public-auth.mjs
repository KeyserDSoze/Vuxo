#!/usr/bin/env node
/**
 * Read-only public production auth smoke. No OAuth tokens or private credentials.
 * Do not print provider Client IDs or raw upstream response bodies in diagnostics.
 */
import { pathToFileURL } from 'node:url';

const API = 'https://api.vuxoapi.xyz';
const WEB = 'https://vuxo.quest';

// Status numbers are safe to disclose; never print a response body, Location or token.
function safeStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : 'unknown';
}

function requireOk(response, context) {
  if (response.status !== 200) throw new Error(context + ': expected HTTP 200 (got HTTP ' + safeStatus(response.status) + ')');
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

  // Anonymous probes prove that the public reverse proxy forwards the
  // owner-only routes to the deployed API without exposing private history.
  // No JWT, cookie, player ID, or gameplay payload is transmitted or logged.
  for (const name of ['completed', 'outcomes']) {
    const context = 'history: ' + name;
    const path = API + '/api/personal-content/history/' + name;

    const anonymous = await get(path, { headers: { Origin: WEB } });
    if (anonymous.status !== 401) {
      throw new Error(context + ': anonymous GET must return HTTP 401 (got HTTP ' + anonymous.status + ')');
    }
    requireCors(anonymous, context);

    const options = await get(path, {
      method: 'OPTIONS',
      headers: {
        Origin: WEB,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    if (![200, 204].includes(options.status)) {
      throw new Error(context + ': preflight status is not allowed (got HTTP ' + options.status + ')');
    }
    requireCors(options, context);
    const allowedMethods = (options.headers.get('access-control-allow-methods') ?? '')
      .toUpperCase().split(',').map(value => value.trim());
    const allowedHeaders = (options.headers.get('access-control-allow-headers') ?? '')
      .toLowerCase().split(',').map(value => value.trim());
    if (!allowedMethods.includes('GET') && !allowedMethods.includes('*')) {
      throw new Error(context + ': preflight GET is not allowed');
    }
    if (!allowedHeaders.includes('authorization') && !allowedHeaders.includes('*')) {
      throw new Error(context + ': preflight Authorization is not allowed');
    }
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
        const message = error instanceof Error && /^(health|version|providers|google|microsoft|preflight|history|Microsoft redirect bridge):/.test(error.message)
          ? error.message : 'network, response or timeout error';
        throw new Error('Public authentication check failed: ' + message);
      }
      await sleep(retryDelayMs);
    }
  }
}
/**
 * Read-only status probe for a GitHub-hosted runner. After a failed route,
 * continue to check other routes. Do not print bodies or provider IDs.
 */
// A CF-Ray is a request identifier and must never be printed. Only the
// allowlisted three-letter datacenter suffix is useful for comparing remote
// vantage points; malformed or non-Cloudflare headers reveal nothing.
function safeCloudflareColo(ray) {
  if (typeof ray !== 'string' || ray.length > 80) return null;
  const match = /^[a-fA-F0-9]{8,32}-([A-Z]{3})$/.exec(ray.trim());
  return match?.[1] ?? null;
}

// Report only transport categories from a fixed allow-list, never raw error text.
function safeTransportCategory(error) {
  const code = error?.cause?.code ?? error?.code;
  if (code === 'ENOTFOUND') return 'DNS lookup failed';
  if (code === 'EAI_AGAIN') return 'DNS lookup temporarily unavailable';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || error?.name === 'TimeoutError') {
    return 'connection timeout';
  }
  if (['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) {
    return 'TLS certificate error';
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'connection rejected or reset';
  return 'network or timeout failure';
}
export async function diagnosePublicRoutes({ fetcher = fetch, log = console.log } = {}) {
  const observations = [];
  const endpoints = [
    ['health', API + '/health', {}],
    ['version', API + '/api/meta/version', {}],
    ['providers', API + '/api/auth/providers', { headers: { Origin: WEB } }],
    ['social-preflight', API + '/api/auth/social', { method: 'OPTIONS', headers: {
      Origin: WEB,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    } }],
    // Anonymous Journal probes deliberately omit cookies, Authorization and player IDs.
    ['history-completed', API + '/api/personal-content/history/completed', { headers: { Origin: WEB } }],
    ['history-completed-preflight', API + '/api/personal-content/history/completed', {
      method: 'OPTIONS', headers: {
        Origin: WEB, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    }],
    ['history-outcomes', API + '/api/personal-content/history/outcomes', { headers: { Origin: WEB } }],
    ['history-outcomes-preflight', API + '/api/personal-content/history/outcomes', {
      method: 'OPTIONS', headers: {
        Origin: WEB, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    }],
    ['msal-bridge', WEB + '/redirect.html', {}],
  ];
  for (const [label, url, options] of endpoints) {
    try {
      const response = await fetcher(url, {
        ...options, redirect: 'manual', signal: AbortSignal.timeout(8000),
      });
      const server = response.headers?.get('server')?.toLowerCase().includes('cloudflare')
        ? 'cloudflare' : 'other';
      const colo = server === 'cloudflare'
        ? safeCloudflareColo(response.headers?.get('cf-ray')) : null;
      const status = Number.isInteger(response.status) && response.status >= 100
        && response.status <= 599 ? response.status : null;
      // Strict allowlist for downstream multi-sample diagnostics. Only safe
      // status/POP/server categories; never raw headers, bodies or CF-Ray IDs.
      observations.push({ label, status, server, colo, transport: null });
      log(label + ': HTTP ' + safeStatus(response.status) + ' (server: ' + server
        + (colo ? ', colo: ' + colo : '') + ')');
    } catch (error) {
      const transport = safeTransportCategory(error);
      observations.push({ label, status: null, server: 'other', colo: null, transport });
      log(label + ': ' + transport);
    }
  }
  return observations;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.VUXO_PUBLIC_AUTH_DIAGNOSTICS === 'true') {
    diagnosePublicRoutes().catch(() => {
      console.error('Public status diagnostics failed without exposing response data');
      process.exitCode = 1;
    });
  } else {
    // A green informational diagnostic never weakens this strict release gate.
    verifyPublicAuth({ expectedCommit: process.env.VUXO_EXPECTED_COMMIT })
      .then(() => console.log('PASS public health, commit, providers, CORS, private history auth, MSAL bridge'))
      .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
