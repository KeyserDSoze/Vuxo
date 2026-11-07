import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./verify-offworld-local.mjs', import.meta.url));

function fixture(callback) {
  const temp = mkdtempSync(join(tmpdir(), 'vuxo-qa-cli-'));
  try {
    mkdirSync(join(temp, 'scripts'), { recursive: true });
    cpSync(source, join(temp, 'scripts', 'verify-offworld-local.mjs'));
    for (const helper of ['offworld-trx.mjs', 'offworld-playwright.mjs'])
      cpSync(fileURLToPath(new URL('./' + helper, import.meta.url)),
        join(temp, 'scripts', helper));
    const cli = join(temp, 'scripts', 'verify-offworld-local.mjs');
    return callback({ temp, cli });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function execute(cli, args = [], options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd ?? tmpdir(), encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, VUXO_TEST_POSTGRES_CONNECTION_STRING: '', ...options.env },
  });
}

test('help is safe, independent of cwd and never starts any workflow', () => fixture(({ cli }) => {
  const result = execute(cli, ['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--check/);
  assert.match(result.stdout, /--contracts/);
  assert.match(result.stdout, /--run/);
  assert.equal(result.stderr, '');
}));

test('preflight fails closed when no SDK, dependencies or test database are present', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--check']);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /READY\s+Node.js 22\+/);
    assert.match(result.stdout, /MISSING\s+Frontend dependencies installed/);
    assert.match(result.stdout, /MISSING\s+Test PostgreSQL connection configured/);
    assert.match(result.stderr, /Off-world gate blocked/);
    assert.doesNotMatch(result.stdout + result.stderr, /LOCAL OFF-WORLD GATE PASS/);
  }));

test('connection secrets do not appear in logs even if PostgreSQL configuration is set', () =>
  fixture(({ cli }) => {
    const secret = 'Host=127.0.0.1;Username=reporter;Password=DONOTPRINT_12345';
    const result = execute(cli, ['--check'], {
      env: { VUXO_TEST_POSTGRES_CONNECTION_STRING: secret },
    });
    assert.doesNotMatch(result.stdout + result.stderr, /DONOTPRINT_12345/);
    assert.match(result.stdout, /READY\s+Test PostgreSQL connection configured/);
  }));

test('Node-only contracts run without .NET, Postgres, npm installation or Playwright', () =>
  fixture(({ cli, temp }) => {
    const dir = join(temp, 'src', 'frontend', 'scripts');
    mkdirSync(dir, { recursive: true });
    for (const name of [
      'portal-history-cursor.contract.test.mjs',
      'portal-history-pagination.contract.test.mjs',
      'guardian-contracts.contract.test.mjs',
    ]) {
      writeFileSync(join(dir, name),
        `import test from 'node:test'; import assert from 'node:assert/strict';` +
        ` test(${JSON.stringify(name)}, () => assert.equal(1 + 1, 2));\n`);
    }
    const result = execute(cli, ['--contracts'], { cwd: '/' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--experimental-strip-types --test/);
    assert.doesNotMatch(result.stdout + result.stderr, /\.NET 10 SDK/);
  }));

test('Node-only contracts fail rather than invent success if checkout is incomplete', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--contracts']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing focused test sources/);
  }));

test('full local gate refuses to run when prerequisite checks fail', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--run']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Preflight failed; no tests were started/);
    assert.doesNotMatch(result.stdout + result.stderr, /LOCAL OFF-WORLD GATE PASS/);
  }));

test('a configured database still requires an explicit disposable-cluster acknowledgement', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--check'], { env: {
      VUXO_TEST_POSTGRES_CONNECTION_STRING: 'Host=localhost;Password=DO_NOT_LEAK',
      VUXO_TEST_POSTGRES_ACK: '',
    }});
    assert.equal(result.status, 2);
    assert.match(result.stdout, /READY\s+Test PostgreSQL connection configured/);
    assert.match(result.stdout, /MISSING\s+Disposable PostgreSQL cluster explicitly acknowledged/);
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_LEAK/);
  }));

test('preflight accepts disposable confirmation but still rejects missing .NET and frontend tools', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--check'], { env: {
      VUXO_TEST_POSTGRES_CONNECTION_STRING: 'Host=localhost;Password=DO_NOT_LEAK',
      VUXO_TEST_POSTGRES_ACK: 'disposable',
    }});
    assert.equal(result.status, 2);
    assert.match(result.stdout, /READY\s+Disposable PostgreSQL cluster explicitly acknowledged/);
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_LEAK/);
    assert.doesNotMatch(result.stdout, /Preflight passed/);
  }));

test('invalid options fail explicitly without dispatching a task', () =>
  fixture(({ cli }) => {
    const result = execute(cli, ['--launch-actions']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option/);
    const extra = execute(cli, ['--run', '--launch-actions']);
    assert.equal(extra.status, 1);
    assert.match(extra.stderr, /Only one option/);
  }));
