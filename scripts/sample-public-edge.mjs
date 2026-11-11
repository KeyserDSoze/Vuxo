#!/usr/bin/env node
/**
 * #188: On-demand, repeatable read-only production edge diagnostic.
 * Do not add tokens, cookies, provider IDs, raw headers, response bodies or
 * host-supplied URLs here. This is NEVER a replacement for the strict
 * verifyPublicAuth 200/401/CORS/commit release gate.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { diagnosePublicRoutes } from './verify-public-auth.mjs';

const EXPECTED = Object.freeze([
  ['health', [200]],
  ['version', [200]],
  ['providers', [200]],
  ['social-preflight', [200, 204]],
  ['history-completed', [401]],
  ['history-completed-preflight', [200, 204]],
  ['history-outcomes', [401]],
  ['history-outcomes-preflight', [200, 204]],
  ['msal-bridge', [200]],
]);

const TRANSPORT_CATEGORIES = new Set([
  'DNS lookup failed',
  'DNS lookup temporarily unavailable',
  'connection timeout',
  'TLS certificate error',
  'connection rejected or reset',
  'network or timeout failure',
]);

const safeHttpStatus = value =>
  Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;

function safeObservation(observation, label, expected, round) {
  const status = safeHttpStatus(observation?.status);
  const server = observation?.server === 'cloudflare' ? 'cloudflare' : 'other';
  const colo = server === 'cloudflare' && typeof observation?.colo === 'string'
    && /^[A-Z]{3}$/.test(observation.colo) ? observation.colo : null;
  const transport = status === null
    ? TRANSPORT_CATEGORIES.has(observation?.transport)
      ? observation.transport : 'network or timeout failure'
    : null;
  return {
    round, route: label, status, server, colo, transport,
    expected: expected.join('/'),
    pass: status !== null && expected.includes(status),
  };
}

export async function samplePublicEdge({
  rounds = 3, delayMs = 5000,
  diagnose = diagnosePublicRoutes,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5
    || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000) {
    throw new Error('Invalid bounded edge sample configuration');
  }
  const records = [];
  const colos = new Set();
  for (let round = 1; round <= rounds; round += 1) {
    // The diagnostic continues through all routes even if a health check
    // fails. If the diagnostic itself unexpectedly throws, record 9 failures.
    let observations;
    try {
      observations = await diagnose({ log: () => {} });
    } catch {
      observations = [];
    }
    const byName = new Map(Array.isArray(observations)
      ? observations.filter(record => EXPECTED.some(([name]) => name === record?.label))
        .map(record => [record.label, record])
      : []);
    for (const [label, expected] of EXPECTED) {
      const record = safeObservation(byName.get(label), label, expected, round);
      records.push(record);
      if (record.colo) colos.add(record.colo);
      log('round ' + round + '/' + rounds + ' ' + label + ': '
        + (record.status === null ? record.transport : 'HTTP ' + record.status)
        + ' (expected ' + record.expected + ', server ' + record.server
        + (record.colo ? ', colo ' + record.colo : '') + ')'
        + (record.pass ? ' PASS' : ' FAIL'));
    }
    if (round < rounds) await sleep(delayMs);
  }
  const failures = records.filter(record => !record.pass).length;
  const summary = {
    rounds, totalProbes: records.length, failures, colos: [...colos].sort(), records,
  };
  log('Edge sampling: ' + (failures === 0 ? 'PASS' : 'FAIL')
    + ' (' + failures + '/' + records.length + ' anomalous statuses; '
    + colos.size + ' observed Cloudflare colos).');
  log('This runner is not multi-region: even all-green rounds do NOT close #147 or prove Cloudflare stability.');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  samplePublicEdge().then(summary => {
    // The file contains ONLY fixed route names, statuses, validated POP suffixes
    // and fixed transport categories. The workflow retains it briefly for owner triage.
    if (process.env.VUXO_EDGE_SAMPLE_OUTPUT) {
      writeFileSync(process.env.VUXO_EDGE_SAMPLE_OUTPUT, JSON.stringify(summary, null, 2) + '\n', {
        encoding: 'utf8', mode: 0o600,
      });
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '### Public edge sampling — read-only (#147 / #188)\n'
        + '- Probes: ' + summary.totalProbes + ', anomalous: ' + summary.failures
        + ', observed Cloudflare POP count: ' + summary.colos.length + '\n'
        + '- Result: **' + (summary.failures === 0 ? 'PASS' : 'FAIL') + '**\n'
        + '- Even a green sample does not prove stable multi-POP availability. '
        + 'Strict deploy gate remains unchanged.\n');
    }
    if (summary.failures !== 0) process.exitCode = 1;
  }).catch(() => {
    console.error('Public edge sampling failed without exposing network details');
    process.exitCode = 1;
  });
}
