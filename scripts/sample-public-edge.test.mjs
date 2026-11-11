import assert from 'node:assert/strict';
import test from 'node:test';
import { samplePublicEdge } from './sample-public-edge.mjs';

const routes = [
  'health', 'version', 'providers', 'social-preflight',
  'history-completed', 'history-completed-preflight',
  'history-outcomes', 'history-outcomes-preflight', 'msal-bridge',
];
const statusFor = name => name.startsWith('history-') && !name.endsWith('preflight') ? 401
  : name.endsWith('preflight') ? 204 : 200;
const goodRound = colo => routes.map(label => ({
  label, status: statusFor(label), server: 'cloudflare', colo, transport: null,
}));

test('three independent rounds preserve route expectations, POP differences and bounded delays', async () => {
  const seen = [], pauses = [], lines = [];
  const data = await samplePublicEdge({
    diagnose: async () => goodRound(['DFW', 'MXP', 'IAD'][seen.push(1) - 1]),
    sleep: async n => { pauses.push(n); },
    log: line => lines.push(line),
  });
  assert.equal(data.rounds, 3);
  assert.equal(data.totalProbes, 27);
  assert.equal(data.failures, 0);
  assert.deepEqual(data.colos, ['DFW', 'IAD', 'MXP']);
  assert.deepEqual(pauses, [5000, 5000]);
  assert.equal(lines.length, 29);
  assert.match(lines[28], /does not prove Cloudflare stability/);
});

test('502 and 401 in the same POP are recorded independently and cannot produce green', async () => {
  let round = 0;
  const data = await samplePublicEdge({
    rounds: 2, delayMs: 0, sleep: async () => {},
    diagnose: async () => {
      const records = goodRound('DFW');
      if (++round === 1) records.find(r => r.label === 'providers').status = 502;
      return records;
    },
    log: () => {},
  });
  assert.equal(data.failures, 1);
  assert.equal(data.records.find(r => r.round === 1 && r.route === 'providers').status, 502);
  assert.equal(data.records.find(r => r.round === 1 && r.route === 'history-outcomes').status, 401);
  assert.equal(data.records.find(r => r.round === 2 && r.route === 'providers').pass, true);
});

test('timeout and unexpected exception give fixed categories, continue all samples without exposing error', async () => {
  const secret = 'PRIVATE-CF-RAY-SECRET-AND-TOKEN';
  const logs = [];
  const data = await samplePublicEdge({
    rounds: 2, delayMs: 0, sleep: async () => {},
    diagnose: (() => {
      let n = 0;
      return async () => {
        if (++n === 1) throw new Error(secret);
        return goodRound(secret).map(r => ({ ...r, server: secret, colo: secret,
          transport: secret, unexpectedField: secret }));
      };
    })(),
    log: x => logs.push(x),
  });
  assert.equal(data.totalProbes, 18);
  assert.equal(data.failures, 9);
  assert.deepEqual(data.colos, []);
  assert.equal(data.records[0].transport, 'network or timeout failure');
  assert.ok(!JSON.stringify(data).includes(secret));
  assert.ok(!logs.join(' ').includes(secret));
});

test('out-of-range and missing observations never pass or leak untrusted diagnostics', async () => {
  const data = await samplePublicEdge({
    rounds: 1,
    diagnose: async () => [{ label: 'health', status: 200, server: 'cloudflare',
      colo: 'PRIVATE-NON-POP', message: 'secret' }],
    log: () => {},
  });
  assert.equal(data.records[0].pass, true);
  assert.equal(data.records[0].colo, null);
  assert.equal(data.failures, 8);
  for (const invalid of [0, 6, 1.2]) {
    await assert.rejects(() => samplePublicEdge({ rounds: invalid }), /Invalid bounded/);
  }
  for (const invalid of [-1, 60001, 0.1]) {
    await assert.rejects(() => samplePublicEdge({ delayMs: invalid }), /Invalid bounded/);
  }
});

test('no credentials or raw network metadata can appear in redacted sample output', async () => {
  const secret = 'SECRET_PROVIDER_CLIENT_ID_OR_LOCATION';
  const log = [];
  const data = await samplePublicEdge({
    rounds: 1, log: s => log.push(s),
    diagnose: async () => goodRound('SEA').map(r => ({
      ...r,
      colo: r.label === 'health' ? 'SJC' : r.colo,
      requestId: secret, body: secret, url: secret, headers: { Cookie: secret },
    })),
  });
  assert.equal(data.failures, 0);
  assert.deepEqual(data.colos, ['SEA', 'SJC']);
  assert.ok(!JSON.stringify(data).includes(secret));
  assert.ok(!log.join(' ').includes(secret));
  assert.deepEqual(Object.keys(data.records[0]), [
    'round', 'route', 'status', 'server', 'colo', 'transport', 'expected', 'pass',
  ]);
});
