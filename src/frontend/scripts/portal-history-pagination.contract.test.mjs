import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPortalHistoryPage } from '../src/features/refuge/portalHistoryPageMerge.ts';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const timestamp = fraction => '2026-11-07T11:00:00.' + fraction + 'Z';
const completed = (id, fraction) => ({
  grantId: id, contentKey: 'portal.test', ruleVersion: 'personal-content-v1',
  grantedAtUtc: '2026-11-01T00:00:00Z', completedAtUtc: timestamp(fraction),
  rewardItemKey: null,
});
const outcome = (id, fraction) => ({
  eventId: id, grantId: a, kind: 'sequence_completed',
  contentKey: 'portal.test', ruleVersion: 'personal-content-v1',
  occurredAtUtc: timestamp(fraction), rewardItemKey: null,
});
const bad = fn => assert.throws(fn, { message: 'portal_history_snapshot_changed' });

test('completed history appends older pages, preserving exact 100ns order', () => {
  const first = [completed(a, '1234568')];
  const second = [completed(b, '1234567')];
  assert.deepEqual(appendPortalHistoryPage(first, second, 'completed', 2), [...first, ...second]);
  assert.deepEqual(first, [completed(a, '1234568')]); // existing page remains immutable
});
test('outcome history appends distinct event ids even for the same portal grant', () => {
  const first = [outcome(a, '1234568')];
  const second = [outcome(b, '1234567')];
  assert.deepEqual(appendPortalHistoryPage(first, second, 'outcomes', 2), [...first, ...second]);
});
test('a case-only duplicate completed grant between two pages is rejected', () => {
  bad(() => appendPortalHistoryPage([completed(a, '1234568')],
    [completed(a.toUpperCase(), '1234567')], 'completed', 2));
});
test('a duplicate outcome event id across pages is rejected even if grants differ', () => {
  bad(() => appendPortalHistoryPage([outcome(a, '1234568')],
    [{ ...outcome(a.toUpperCase(), '1234567'), grantId: b }], 'outcomes', 2));
});
test('a newly inserted completion in page 2 cannot follow an older page 1 row', () => {
  bad(() => appendPortalHistoryPage([completed(a, '1234567')],
    [completed(b, '1234568')], 'completed', 2));
});
test('a newer outcome at 100ns precision is never appended after an older row', () => {
  bad(() => appendPortalHistoryPage([outcome(a, '1234567')],
    [outcome(b, '1234568')], 'outcomes', 2));
});
test('a malformed within-page sort order cannot be presented as verified history', () => {
  bad(() => appendPortalHistoryPage([], [completed(a, '1234567'),
    completed(b, '1234568')], 'completed', 1));
});
test('timestamps that describe the same instant with different offsets are allowed', () => {
  const first = [completed(a, '1234567')];
  const second = [{ ...completed(b, '0000000'), completedAtUtc: '2026-11-07T12:00:00+01:00' }];
  assert.equal(appendPortalHistoryPage(first, second, 'completed', 2).length, 2);
});
test('a page-one retry resets stale rows instead of merging old pages', () => {
  const previous = [completed(a, '1234568')];
  const now = [completed(b, '1234567')];
  assert.deepEqual(appendPortalHistoryPage(previous, now, 'completed', 1), now);
});
test('a page 2 without accepted page 1 is rejected and must retry from the beginning', () => {
  bad(() => appendPortalHistoryPage([], [completed(b, '1234567')], 'completed', 2));
  bad(() => appendPortalHistoryPage([], [], 'outcomes', 2));
});
test('mode mismatch rejects a page and never mixes completed grants with outcomes', () => {
  bad(() => appendPortalHistoryPage([], [outcome(a, '1234568')], 'completed', 1));
  bad(() => appendPortalHistoryPage([], [completed(a, '1234568')], 'outcomes', 1));
  bad(() => appendPortalHistoryPage([completed(a, '1234568')],
    [outcome(b, '1234567')], 'outcomes', 2));
});
test('invalid page indexes and duplicate entries in one response are rejected', () => {
  for (const index of [-1, 0, NaN, 1.5, 1001])
    bad(() => appendPortalHistoryPage([], [completed(a, '1234568')], 'completed', index));
  bad(() => appendPortalHistoryPage([], [completed(a, '1234568'),
    completed(a, '1234567')], 'completed', 1));
});
test('same-timestamp completions must follow descending public grant IDs', () => {
  const rows = [completed(c, '1234567'), completed(b, '1234567'),
    completed(a, '1234567')];
  assert.equal(appendPortalHistoryPage([], rows, 'completed', 1).length, 3);
  bad(() => appendPortalHistoryPage([], [completed(a, '1234567'),
    completed(b, '1234567')], 'completed', 1));
});
test('equal-timestamp completion boundary rejects an ID newer than the cursor', () => {
  bad(() => appendPortalHistoryPage([completed(a, '1234567')],
    [completed(b, '1234567')], 'completed', 2));
  assert.equal(appendPortalHistoryPage([completed(c, '1234567')],
    [completed(b, '1234567')], 'completed', 2).length, 2);
});
test('equal-timestamp outcome boundary uses public event ID, not repeated grant ID', () => {
  bad(() => appendPortalHistoryPage([outcome(a, '1234567')],
    [outcome(b, '1234567')], 'outcomes', 2));
  assert.equal(appendPortalHistoryPage([outcome(c, '1234567')],
    [outcome(b, '1234567')], 'outcomes', 2).length, 2);
});
test('equivalent time zones still enforce UUID tie ordering at 100ns precision', () => {
  const newest = completed(c, '1234567');
  const older = { ...completed(b, '1234567'),
    completedAtUtc: '2026-11-07T12:00:00.1234567+01:00' };
  assert.equal(appendPortalHistoryPage([newest], [older], 'completed', 2).length, 2);
  bad(() => appendPortalHistoryPage([older], [newest], 'completed', 2));
});
