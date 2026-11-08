import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPortalHistoryByLocalDay } from '../src/features/refuge/portalHistoryDayGroups.ts';

const completion = (id, time) => Object.freeze({
  grantId: id, contentKey: 'portal.memory.grove', ruleVersion: 'personal-content-v1',
  grantedAtUtc: '2026-10-01T00:00:00Z', completedAtUtc: time, rewardItemKey: null,
});
const outcome = (id, time, kind = 'guardian_victory') => Object.freeze({
  eventId: id, grantId: '11111111-1111-4111-8111-111111111111',
  contentKey: 'portal.guardian.grove', ruleVersion: 'portal-guardian-v1',
  occurredAtUtc: time, kind, rewardItemKey: null,
});
const groups = (entries, locale = 'it-IT', zone = 'Europe/Rome') =>
  groupPortalHistoryByLocalDay(entries, locale, zone);
const one = completion('11111111-1111-4111-8111-111111111111', '2026-11-07T12:00:00Z');
const two = completion('22222222-2222-4222-8222-222222222222', '2026-11-07T11:00:00Z');
const three = completion('33333333-3333-4333-8333-333333333333', '2026-11-06T11:00:00Z');

test('no verified owner events means no fabricated days', () => {
  assert.deepEqual(groups([]), []);
});
test('groups consecutive completion receipts by the same local day without reordering', () => {
  const result = groups([one, two, three]);
  assert.deepEqual(result.map(x => x.key), ['2026-11-07', '2026-11-06']);
  assert.deepEqual(result.map(x => x.items), [[one, two], [three]]);
});
test('preserves the exact object identities and does not mutate accepted audit rows', () => {
  const rows = Object.freeze([one, two, three]);
  const result = groups(rows);
  assert.equal(result[0].items[0], one);
  assert.equal(result[0].items[1], two);
  assert.deepEqual(rows, [one, two, three]);
});
test('outcome history uses occurredAtUtc instead of grant or completion dates', () => {
  const first = outcome('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-07T09:30:00Z');
  const second = outcome('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-06T09:30:00Z', 'guardian_retreat');
  assert.deepEqual(groups([first, second]).map(x => x.key), ['2026-11-07', '2026-11-06']);
});
test('mixed verified audit events on one day appear in the original chronological order', () => {
  const win = outcome('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-07T11:30:00Z');
  assert.deepEqual(groups([one, win, two])[0].items, [one, win, two]);
});
test('groups by device local day, not UTC day, at the midnight boundary', () => {
  const nearMidnight = completion('44444444-4444-4444-8444-444444444444', '2026-11-07T23:30:00Z');
  assert.deepEqual(groups([nearMidnight], 'it-IT', 'Europe/Rome').map(x => x.key), ['2026-11-08']);
  assert.deepEqual(groups([nearMidnight], 'en-US', 'America/Los_Angeles').map(x => x.key), ['2026-11-07']);
});
test('daylight-saving repeated hour belongs to a single local calendar day', () => {
  const first = outcome('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-01T05:30:00Z');
  const second = outcome('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-01T06:30:00Z');
  const result = groups([first, second], 'en-US', 'America/New_York');
  assert.equal(result.length, 1);
  assert.equal(result[0].key, '2026-11-01');
  assert.deepEqual(result[0].items, [first, second]);
});
test('localized heading changes language but not grouping or event order', () => {
  const it = groups([one, two, three], 'it-IT');
  const en = groups([one, two, three], 'en-US');
  assert.deepEqual(it.map(x => x.key), en.map(x => x.key));
  assert.notEqual(it[0].label, en[0].label);
  assert.deepEqual(it.flatMap(x => x.items), en.flatMap(x => x.items));
});
test('filtered or partially loaded pages produce counts only for included records', () => {
  const result = groups([two, three]);
  assert.deepEqual(result.map(x => x.items.length), [1, 1]);
  assert.equal(result.flatMap(x => x.items).length, 2);
});
test('UTC timezone uses UTC calendar dates even around the local midnight', () => {
  const afterMidnight = completion('55555555-5555-4555-8555-555555555555', '2026-11-08T00:20:00Z');
  assert.deepEqual(groups([afterMidnight], 'en-US', 'UTC').map(x => x.key), ['2026-11-08']);
});
test('supports offsets and 100ns timestamps from validated server receipts', () => {
  const offset = completion('66666666-6666-4666-8666-666666666666', '2026-11-08T00:00:00.1234567+01:00');
  assert.deepEqual(groups([offset], 'it-IT', 'Europe/Rome').map(x => x.key), ['2026-11-08']);
});
test('the group key is a stable numeric local calendar date even when locale uses other numerals', () => {
  assert.equal(groups([one], 'ar-EG', 'Europe/Rome')[0].key, '2026-11-07');
});
