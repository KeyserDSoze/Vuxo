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
  rewardItemKey: null,
};
const outcome = {
  eventId, grantId, contentKey: completed.contentKey, ruleVersion: completed.ruleVersion,
  occurredAtUtc: completed.completedAtUtc, kind: 'sequence_completed',
  rewardItemKey: null,
};
const cursor = 'CN87I43fEAARERERERERQYERERERERER';
const eventCursor = 'CN87I43fEACqqqqqqqqqSoqqqqqqqqqq';
const page = (items, more, token) => ({
  items, page: 1, pageSize: 20, hasMore: more, ...(token === undefined ? {} : { nextCursor: token }),
});
const invalid = fn => assert.throws(fn, { message: 'portal_history_invalid_response' });

test('completion history accepts a valid cursor when more owner rows exist', () => {
  const parsed = parsePortalCompletionPage(page([completed], true, cursor), 1);
  assert.equal(parsed.nextCursor, cursor);
  assert.equal(parsed.items[0].grantId, grantId);
});
test('outcome history accepts its own public event-identity cursor', () => {
  const parsed = parsePortalOutcomePage(page([outcome], true, eventCursor), 1);
  assert.equal(parsed.nextCursor, eventCursor);
  assert.equal(parsed.items[0].eventId, eventId);
});
test('history accepts legacy offset pages when nextCursor is absent', () => {
  const parsed = parsePortalCompletionPage(page([completed], true), 1);
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.nextCursor, undefined);
});
test('terminal page accepts null cursor but rejects any non-null continuation', () => {
  assert.equal(parsePortalCompletionPage(page([completed], false, null), 1).nextCursor, null);
  invalid(() => parsePortalCompletionPage(page([completed], false, cursor), 1));
  invalid(() => parsePortalOutcomePage(page([outcome], false, eventCursor), 1));
});
test('no malformed or forged-shaped continuation reaches the Journal page controls', () => {
  for (const value of ['', 'bad', '!', 9, true, {}, [], cursor + 'x',
    cursor.slice(0, -1) + '=', 'X'.repeat(33)]) {
    invalid(() => parsePortalCompletionPage(page([completed], true, value), 1));
    invalid(() => parsePortalOutcomePage(page([outcome], true, value), 1));
  }
});
test('wrong metadata, mixed owner references and over-sized responses still fail closed', () => {
  invalid(() => parsePortalCompletionPage({
    ...page([completed], true, cursor), page: 2,
  }, 1));
  invalid(() => parsePortalOutcomePage({
    ...page([outcome, { ...outcome, eventId: eventId.toUpperCase() }], true, eventCursor),
  }, 1));
});
