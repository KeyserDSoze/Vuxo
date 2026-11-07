import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassedPlaywrightReport } from './offworld-playwright.mjs';

const report = stats => JSON.stringify({
  suites: [{ title: 'refuge journal', specs: [{ title: 'renders a portal' }] }],
  stats: { expected: 4, unexpected: 0, flaky: 0, skipped: 0, ...stats },
  errors: [],
});

test('Playwright report accepts executed clean browser tests', () => {
  assert.deepEqual(verifyPassedPlaywrightReport(report({})), { passed: 4 });
});
test('a browser run that discovered zero tests must never appear green', () => {
  assert.throws(() => verifyPassedPlaywrightReport(report({ expected: 0 })), /Incomplete/);
});
test('skipped, flaky and failed Playwright cases fail the release gate', () => {
  for (const key of ['skipped', 'flaky', 'unexpected'])
    assert.throws(() => verifyPassedPlaywrightReport(report({ [key]: 1 })), /Incomplete/);
});
test('interrupted/malformed Playwright JSON cannot pass by accident', () => {
  for (const input of ['', 'not JSON', 'null', '[]', '{}', JSON.stringify({ suites: [], stats: { expected: 1 } })])
    assert.throws(() => verifyPassedPlaywrightReport(input), /Invalid/);
});
test('missing count fields or playwright reporter errors fail closed', () => {
  const base = JSON.parse(report({}));
  delete base.stats.skipped;
  assert.throws(() => verifyPassedPlaywrightReport(JSON.stringify(base)), /Incomplete/);
  base.stats.skipped = 0;
  base.errors = [{ message: 'fatal reporter error' }];
  assert.throws(() => verifyPassedPlaywrightReport(JSON.stringify(base)), /Incomplete/);
});
