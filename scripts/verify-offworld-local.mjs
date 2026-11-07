#!/usr/bin/env node
/**
 * Local off-world release gate for Windows, macOS and Linux.
 * No Docker, GitHub Actions, credentials logging, or production mutations.
 * PostgreSQL integration tests provision their own throwaway databases.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPassedTrx } from './offworld-trx.mjs';
import { verifyPassedPlaywrightReport } from './offworld-playwright.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const frontend = join(root, 'src', 'frontend');
const infrastructure = 'tests/backend/Vuxo.Infrastructure.Tests/Vuxo.Infrastructure.Tests.csproj';
const application = 'tests/backend/Vuxo.Application.Tests/Vuxo.Application.Tests.csproj';
const api = 'tests/backend/Vuxo.Api.Tests/Vuxo.Api.Tests.csproj';
const focused = [
  'src/frontend/scripts/portal-history-cursor.contract.test.mjs',
  'src/frontend/scripts/portal-history-pagination.contract.test.mjs',
  'src/frontend/scripts/portal-history-navigation.contract.test.mjs',
  'src/frontend/scripts/portal-history-view.contract.test.mjs',
  'src/frontend/scripts/guardian-contracts.contract.test.mjs',
];
const browserTests = [
  'tests/refuge-linked-rewards.spec.ts',
  'tests/refuge-completion-history.spec.ts',
  'tests/refuge-outcome-history.spec.ts',
  'tests/refuge-journal.spec.ts',
  'tests/portal-owner-session.spec.ts',
  'tests/world-portals.spec.ts',
];
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const npx = isWindows ? 'npx.cmd' : 'npx';
const postgresAck = 'VUXO_TEST_POSTGRES_ACK';
const requiredAck = 'disposable';

function probe(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
    shell: isWindows && (cmd === npm || cmd === npx),
  });
  return result.status === 0 ? (result.stdout ?? '').trim() : null;
}

function prerequisites() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const dotnetVersion = probe('dotnet', ['--version']);
  return [
    ['Node.js 22+', Number.isInteger(nodeMajor) && nodeMajor >= 22],
    ['.NET 10 SDK', dotnetVersion !== null && /^10\./.test(dotnetVersion)],
    ['npm', probe(npm, ['--version']) !== null],
    ['Frontend dependencies installed', existsSync(join(frontend, 'node_modules', 'typescript'))],
    ['Playwright package installed', existsSync(join(frontend, 'node_modules', '@playwright', 'test'))],
    ['Test PostgreSQL connection configured', Boolean(process.env.VUXO_TEST_POSTGRES_CONNECTION_STRING?.trim())],
    ['Disposable PostgreSQL cluster explicitly acknowledged',
      process.env[postgresAck] === requiredAck],
    ['Vuxo solution checked out', existsSync(join(root, 'Vuxo.sln'))],
    ['Vuxo backend projects checked out', [application, api, infrastructure]
      .every(p => existsSync(join(root, p)))],
    ['Focused contract files checked out', focused.every(p => existsSync(join(root, p)))],
    ['Browser test files checked out', browserTests.every(p => existsSync(join(frontend, p)))],
  ];
}

function check() {
  const status = prerequisites();
  for (const [name, ready] of status)
    process.stdout.write(`${ready ? 'READY' : 'MISSING'}  ${name}\n`);
  const missing = status.filter(([, ready]) => !ready).map(([name]) => name);
  if (missing.length) {
    process.stderr.write(`Off-world gate blocked: ${missing.length} prerequisite(s) missing.\n`);
    process.stderr.write('Use a dedicated NONPRODUCTION PostgreSQL server. ' +
      'Set ' + postgresAck + '=' + requiredAck + ' only after verifying the cluster.\n');
    process.stderr.write('The runner does not echo secrets, but tool error logs may still contain them.\n');
  } else {
    process.stdout.write('Preflight passed. Chromium browser presence is verified by Playwright during --run.\n');
  }
  return missing.length === 0;
}

function run(cmd, args, cwd = root, env = process.env) {
  process.stdout.write(`\n# ${cmd} ${args.join(' ')}\n`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit',
    shell: isWindows && (cmd === npm || cmd === npx), env });
  if (result.error || result.status !== 0)
    throw new Error(`${cmd} exited with ${result.status ?? String(result.error)}; release gate FAILED`);
}

function contracts() {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Node 22 or newer is required for --experimental-strip-types');
  const missing = focused.filter(p => !existsSync(join(root, p)));
  if (missing.length) throw new Error(`Missing focused test sources: ${missing.join(', ')}`);
  run(process.execPath, ['--experimental-strip-types', '--test', ...focused]);
}

function assertTrxPassed(resultFile) {
  if (!existsSync(resultFile)) throw new Error(`Missing .NET TRX test report: ${resultFile}`);
  const { total, passed } = verifyPassedTrx(readFileSync(resultFile, 'utf8'), resultFile);
  process.stdout.write(`Verified TRX: ${passed}/${total} tests executed and passed.\n`);
}

function backendTest(project, filter, filename, resultDir) {
  run('dotnet', ['test', project, '-c', 'Release', '--no-build', '--no-restore',
    '--filter', `FullyQualifiedName~${filter}`, '--logger', `trx;LogFileName=${filename}`,
    '--results-directory', resultDir]);
  assertTrxPassed(join(resultDir, filename));
}

function all() {
  if (!check()) throw new Error('Preflight failed; no tests were started');
  // Never report success based only on tests that xUnit skipped because the
  // PostgreSQL connection variable was missing: it is mandatory above.
  const resultDir = mkdtempSync(join(tmpdir(), 'vuxo-offworld-'));
  try {
    run(process.execPath, ['--test', 'scripts/verify-offworld-local.test.mjs',
      'scripts/offworld-trx.test.mjs', 'scripts/offworld-playwright.test.mjs']);
    contracts();
    run('dotnet', ['restore', 'Vuxo.sln']);
    run('dotnet', ['build', 'Vuxo.sln', '-c', 'Release', '--no-restore']);
    backendTest(application, 'PortalHistoryCursorTests', 'cursor.trx', resultDir);
    backendTest(api, 'PortalCompletionHistoryApiTests', 'completion-api.trx', resultDir);
    backendTest(api, 'PortalOutcomeHistoryApiTests', 'outcome-api.trx', resultDir);
    backendTest(infrastructure, 'PortalCompletionHistoryPersistenceTests', 'completion-db.trx', resultDir);
    backendTest(infrastructure, 'PortalOutcomeHistoryPersistenceTests', 'outcome-db.trx', resultDir);
    backendTest(infrastructure, 'PortalGuardianPersistenceTests', 'guardian-db.trx', resultDir);
    run(npm, ['run', 'test:contracts'], frontend);
    run(npm, ['run', 'build'], frontend);
    const browserReport = join(resultDir, 'playwright-report.json');
    run(npx, ['--no-install', 'playwright', 'test', '--reporter=json', ...browserTests],
      frontend, { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: browserReport });
    if (!existsSync(browserReport)) throw new Error('Missing Playwright JSON report');
    const { passed } = verifyPassedPlaywrightReport(readFileSync(browserReport, 'utf8'), browserReport);
    process.stdout.write(`Verified Playwright: ${passed} browser tests passed without skips.\n`);
    process.stdout.write('\nLOCAL OFF-WORLD GATE PASS: all selected suites completed.\n');
  } finally {
    // TRX artifacts contain local test metadata; do not leave traces around.
    rmSync(resultDir, { recursive: true, force: true });
  }
}

const usage = `VUXO off-world local QA (no CI, deployment or Docker)\n\n` +
  `  node scripts/verify-offworld-local.mjs --check       Check local prerequisites\n` +
  `  node scripts/verify-offworld-local.mjs --contracts   Run Node contracts only\n` +
  `  node scripts/verify-offworld-local.mjs --run         Run .NET, PostgreSQL, React and browser gates\n` +
  `\nFor --run, configure VUXO_TEST_POSTGRES_CONNECTION_STRING with a dedicated TEST cluster,\n` +
  `then explicitly set VUXO_TEST_POSTGRES_ACK=disposable after verifying it is NOT production.\n` +
  `The launcher never echoes credentials; tool errors can still contain sensitive details.\n` +
  `Real Chromium installation is required for Playwright.\n`;

try {
  const mode = process.argv[2] ?? '--check';
  if (process.argv.length > 3) throw new Error('Only one option is accepted; use --help');
  switch (mode) {
    case '--help': process.stdout.write(usage); break;
    case '--check': if (!check()) process.exitCode = 2; break;
    case '--contracts': contracts(); break;
    case '--run': all(); break;
    default: throw new Error(`Unknown option ${mode}; use --help`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
