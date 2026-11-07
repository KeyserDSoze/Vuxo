import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassedTrx } from './offworld-trx.mjs';

const trx = attributes => `<?xml version="1.0" encoding="utf-8"?>
<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <ResultSummary outcome="Completed">
    <Counters ${attributes} />
  </ResultSummary>
</TestRun>`;
const good = 'total="3" executed="3" passed="3" failed="0" notExecuted="0"';

test('accepts an actually executed and fully passed TRX result', () => {
  assert.deepEqual(verifyPassedTrx(trx(good)), { total: 3, passed: 3 });
});
test('rejects zero discovered tests even when the runner returned exit code zero', () => {
  assert.throws(() => verifyPassedTrx(trx('total="0" executed="0" passed="0" failed="0" notExecuted="0"')), /Incomplete/);
});
test('rejects all or partially skipped PostgreSQL integration facts', () => {
  assert.throws(() => verifyPassedTrx(trx('total="3" executed="0" passed="0" failed="0" notExecuted="3"')), /Incomplete/);
  assert.throws(() => verifyPassedTrx(trx('total="3" executed="2" passed="2" failed="0" notExecuted="1"')), /Incomplete/);
});
test('rejects xUnit failure even if some cases succeeded', () => {
  assert.throws(() => verifyPassedTrx(trx('total="3" executed="3" passed="2" failed="1" notExecuted="0"')), /Incomplete/);
});
test('rejects errored, aborted, inconclusive, timed out and in-progress cases', () => {
  for (const key of ['error', 'timeout', 'aborted', 'inconclusive', 'notRunnable', 'disconnected', 'warning', 'pending', 'inProgress'])
    assert.throws(() => verifyPassedTrx(trx(`${good} ${key}="1"`)), /Incomplete/, key);
});
test('rejects missing, malformed and non-XML test summaries', () => {
  for (const value of [null, undefined, {}, '', '<TestRun/>', '<Counters/>', '<Counters total="3"/>'])
    assert.throws(() => verifyPassedTrx(value), /Invalid|Incomplete/);
});
test('accepts genuine namespaced TRX counters and attribute ordering variations', () => {
  assert.deepEqual(verifyPassedTrx(`<t:TestRun><t:Counters  failed='0' passed='5' notExecuted='0' executed='5' total='5'/></t:TestRun>`), { total: 5, passed: 5 });
});
