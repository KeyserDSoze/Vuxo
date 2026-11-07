import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPortalHistoryEntries } from '../src/features/refuge/portalHistoryView.ts';

const rune = {
  grantId: '11111111-1111-4111-8111-111111111111',
  contentKey: 'portal.memory.grove', ruleVersion: 'personal-content-v1',
  grantedAtUtc: '2026-11-01T10:00:00Z', completedAtUtc: '2026-11-05T10:00:00Z',
  rewardItemKey: 'item.grove_seed.v1',
};
const firstMistake = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', grantId: rune.grantId,
  contentKey: rune.contentKey, ruleVersion: 'portal-mistake-damage-v1',
  occurredAtUtc: '2026-11-04T10:00:00Z', kind: 'sequence_first_mistake',
  rewardItemKey: null,
};
const victory = {
  ...firstMistake, eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contentKey: 'portal.guardian.grove', kind: 'guardian_victory',
  ruleVersion: 'portal-guardian-showdown-v2',
};
const retreat = {
  ...victory, eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  kind: 'guardian_retreat',
};
const unawardedRune = {
  ...firstMistake, eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  kind: 'sequence_completed', rewardItemKey: null,
};
const confirmedRune = {
  ...unawardedRune, eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  rewardItemKey: 'item.grove_seed.v1',
};
const timeline = [confirmedRune, victory, firstMistake, retreat, unawardedRune];
const by = (items, filter = 'all', query = '') => filterPortalHistoryEntries(items, filter, query);

test('all preserves the exact previously verified order and does not mutate input', () => {
  const copy = [...timeline];
  assert.deepEqual(by(timeline), timeline);
  assert.deepEqual(timeline, copy);
});
test('runes works with completed DTOs that have no kind and with outcome DTOs', () => {
  assert.deepEqual(by([rune, ...timeline], 'runes'), [rune, confirmedRune, unawardedRune]);
});
test('mistakes shows only the verified first damaging mistake family', () => {
  assert.deepEqual(by(timeline, 'mistakes'), [firstMistake]);
});
test('guardians groups both victory and retreat, never rune errors', () => {
  assert.deepEqual(by(timeline, 'guardians'), [victory, retreat]);
});
test('rewards are selected from actual verified item key, not victory or solved kind', () => {
  assert.deepEqual(by([rune, ...timeline], 'rewards'), [rune, confirmedRune]);
});
test('search is case insensitive across portal content, rule version and full grant reference', () => {
  assert.deepEqual(by(timeline, 'all', ' GUARDIAN '), [victory, retreat]);
  assert.deepEqual(by(timeline, 'all', 'SHOWDOWN-V2'), [victory, retreat]);
  assert.deepEqual(by([rune, ...timeline], 'all', '11111111-1111-4111'), [rune, ...timeline]);
});
test('search by public event ID distinguishes multiple outcomes sharing the same grant', () => {
  assert.deepEqual(by(timeline, 'all', victory.eventId.toUpperCase()), [victory]);
});
test('combining a kind filter and a search is a strict intersection', () => {
  assert.deepEqual(by(timeline, 'guardians', 'grove'), [victory, retreat]);
  assert.deepEqual(by(timeline, 'mistakes', 'guardian'), []);
});
test('blank whitespace search means no filtering, not an empty history', () => {
  assert.deepEqual(by(timeline, 'all', ' \t '), timeline);
  assert.deepEqual(by([], 'all', 'anything'), []);
});
test('normalizes Unicode compatibility characters without network requests or mutation', () => {
  const row = { ...rune, contentKey: 'relic.fullwidth.ＡＢＣ' };
  assert.deepEqual(by([row], 'all', 'abc'), [row]);
});
test('reward search never invents an item for Guardian victories', () => {
  assert.deepEqual(by(timeline, 'rewards', 'item.grove_seed'), [confirmedRune]);
  assert.deepEqual(by([victory, retreat], 'rewards', ''), []);
});
