import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePortalCompletionPage, parsePortalOutcomePage,
} from '../src/features/portals/portalHistoryContract.ts';

const grantId = '11111111-1111-4111-8111-111111111111';
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const completed = {
  grantId, contentKey: 'portal.memory.grove', ruleVersion: 'personal-content-v1',
  grantedAtUtc: '2026-11-01T10:00:00Z', completedAtUtc: '2026-11-05T10:00:00Z',
};
const outcome = {
  eventId, grantId, contentKey: completed.contentKey, kind: 'sequence_completed',
  ruleVersion: completed.ruleVersion, occurredAtUtc: completed.completedAtUtc,
};
const response = (items, extra = {}) => ({ items, page: 1, pageSize: 20, hasMore: false, ...extra });
const invalid = callback => assert.throws(callback, { message: 'portal_history_invalid_response' });

test('valid completion and unknown future reward keys remain readable', () => {
  const result = parsePortalCompletionPage(response([
    { ...completed, rewardItemKey: 'item.future.unknown.v1' },
  ]), 1);
  assert.equal(result.items[0].rewardItemKey, 'item.future.unknown.v1');
  assert.equal(result.hasMore, false);
});

test('legacy completion without reward gets a safe null rather than invented item', () => {
  assert.equal(parsePortalCompletionPage(response([completed]), 1).items[0].rewardItemKey, null);
});

test('all four canonical outcome kinds are accepted without inferred rewards', () => {
  const kinds = ['sequence_completed', 'sequence_first_mistake', 'guardian_victory', 'guardian_retreat'];
  for (const [i, kind] of kinds.entries()) {
    const result = parsePortalOutcomePage(response([{ ...outcome, eventId:
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, '0')}`, kind }]), 1);
    assert.equal(result.items[0].kind, kind);
    assert.equal(result.items[0].rewardItemKey, null);
  }
});

test('only a verified sequence completion may declare a reward', () => {
  assert.equal(parsePortalOutcomePage(response([{ ...outcome, rewardItemKey: 'item.grove_seed.v1' }]), 1)
    .items[0].rewardItemKey, 'item.grove_seed.v1');
  for (const kind of ['sequence_first_mistake', 'guardian_victory', 'guardian_retreat']) {
    invalid(() => parsePortalOutcomePage(response([{ ...outcome, kind, rewardItemKey: 'item.grove_seed.v1' }]), 1));
  }
});

test('bad page metadata and impossible next pages fail closed', () => {
  for (const patch of [
    { page: 2 }, { pageSize: 0 }, { pageSize: 51 },
    { pageSize: '20' }, { hasMore: 'false' }, { items: null },
    { items: [], hasMore: true },
  ]) invalid(() => parsePortalCompletionPage(response([completed], patch), 1));
  invalid(() => parsePortalCompletionPage(response([completed]), 0));
  invalid(() => parsePortalCompletionPage(response([completed]), 1001));
  invalid(() => parsePortalCompletionPage({ ...response([completed]), items: Array(21).fill(completed) }, 1));
});

test('duplicate completion and outcome IDs do not reach React list keys', () => {
  invalid(() => parsePortalCompletionPage(response([completed, completed]), 1));
  invalid(() => parsePortalOutcomePage(response([outcome, outcome]), 1));
});

test('malformed items and unsupported outcome kinds are rejected', () => {
  for (const value of [null, {}, 11, ['bad']]) invalid(() => parsePortalCompletionPage(value, 1));
  invalid(() => parsePortalCompletionPage(response([{ ...completed, grantedAtUtc: 'not-a-date' }]), 1));
  invalid(() => parsePortalCompletionPage(response([{ ...completed, grantId: 'not-guid' }]), 1));
  invalid(() => parsePortalCompletionPage(response([{ ...completed, rewardItemKey: { item: 'fake' } }]), 1));
  invalid(() => parsePortalOutcomePage(response([{ ...outcome, kind: 'guardian_win' }]), 1));
  invalid(() => parsePortalOutcomePage(response([{ ...outcome, eventId: false }]), 1));
});

test('valid second-page response stays usable', () => {
  const secondPage = parsePortalOutcomePage(response([outcome], { page: 2, pageSize: 1, hasMore: true }), 2);
  assert.equal(secondPage.page, 2);
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.hasMore, true);
});

test('duplicate completed grants are rejected even when UUID casing differs', () => {
  const letteredGrant = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  invalid(() => parsePortalCompletionPage(response([
    { ...completed, grantId: letteredGrant },
    { ...completed, grantId: letteredGrant.toUpperCase() },
  ]), 1));
});

test('duplicate outcome events are rejected despite uppercase/lowercase UUID aliases', () => {
  invalid(() => parsePortalOutcomePage(response([
    outcome, { ...outcome, eventId: eventId.toUpperCase() },
  ]), 1));
});

test('completion cannot be recorded before its original grant', () => {
  invalid(() => parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '2026-11-05T11:00:00Z', completedAtUtc: '2026-11-05T10:00:00Z',
  }]), 1));
  invalid(() => parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '2026-11-05T11:00:00+02:00', completedAtUtc: '2026-11-05T08:59:59Z',
  }]), 1));
});

test('equivalent timestamp offsets and multiple events of one grant remain valid', () => {
  const page = parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '2026-11-05T10:00:00+01:00', completedAtUtc: '2026-11-05T09:00:00Z',
  }]), 1);
  assert.equal(page.items.length, 1);
  const results = parsePortalOutcomePage(response([
    { ...outcome, kind: 'sequence_first_mistake' },
    { ...outcome, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  ]), 1);
  assert.equal(results.items.length, 2);
});


test('invalid calendar dates cannot be silently normalized by JavaScript', () => {
  for (const timestamp of [
    '2026-02-29T10:00:00Z', '2026-02-31T10:00:00Z',
    '2026-04-31T10:00:00Z', '2026-11-00T10:00:00Z',
    '2026-11-07T24:00:00Z', '2026-11-07T10:60:00Z',
  ]) invalid(() => parsePortalCompletionPage(response([{ ...completed, completedAtUtc: timestamp }]), 1));
});

test('leap day, timezone offsets and seven-digit .NET fractions remain valid', () => {
  const result = parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '2024-02-29T09:00:00.1234567+01:00',
    completedAtUtc: '2024-02-29T08:00:00.1234567Z',
  }]), 1);
  assert.equal(result.items.length, 1);
  const outcome = parsePortalOutcomePage(response([{
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    grantId, contentKey: completed.contentKey, ruleVersion: completed.ruleVersion,
    kind: 'sequence_completed', occurredAtUtc: '2024-02-29T08:00:00.1234567Z',
  }]), 1);
  assert.equal(outcome.items.length, 1);
});

test('timestamps must have explicit UTC or offset and valid offset bounds', () => {
  for (const timestamp of [
    '2026-11-07T10:00:00', '2026-11-07T10:00:00+14:01',
    '2026-11-07T10:00:00+15:00', '2026-11-07T10:00:00+01:60',
    '2026-11-07T10:00:00.12345678Z',
  ]) invalid(() => parsePortalOutcomePage(response([{
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', grantId,
    contentKey: completed.contentKey, ruleVersion: completed.ruleVersion,
    kind: 'sequence_completed', occurredAtUtc: timestamp,
  }]), 1));
});

test('century leap-year rule rejects 1900 but accepts 2000', () => {
  invalid(() => parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '1900-02-29T10:00:00Z', completedAtUtc: '1900-03-01T10:00:00Z',
  }]), 1));
  assert.equal(parsePortalCompletionPage(response([{
    ...completed, grantedAtUtc: '2000-02-29T10:00:00Z', completedAtUtc: '2000-03-01T10:00:00Z',
  }]), 1).items.length, 1);
});
