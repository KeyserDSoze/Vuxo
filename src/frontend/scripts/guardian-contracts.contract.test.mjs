import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGuardianStatus, parseGuardianTurn, parseGuardianHistory,
} from '../src/features/portals/guardianContracts.ts';

const grantId = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const status = {
  grantId, turn: 0, guardianHealth: 6, guardianMaxHealth: 6,
  playerHealth: 20, playerMaxHealth: 20, outcome: 'ongoing',
  ruleVersion: 'portal-guardian-showdown-v2',
};
const turn = {
  grantId, idempotencyKey: key, turn: 1, action: 'strike', guardianAction: 'guard',
  damageDealt: 1, damageTaken: 0, guardianHealth: 5, guardianMaxHealth: 6,
  playerHealth: 20, playerMaxHealth: 20, outcome: 'ongoing', replayed: false,
};
const request = { grantId, action: 'strike', expectedTurn: 0, idempotencyKey: key };
const historyRow = {
  turn: 1, action: 'strike', guardianAction: 'guard',
  damageDealt: 1, damageTaken: 0, guardianHealth: 5,
  playerHealth: 20, outcome: 'ongoing',
  occurredAtUtc: '2026-11-07T12:00:00.1234567Z',
};
const bad = (call, message = 'guardian_invalid_response') => assert.throws(call, { message });

test('only the canonical owner status fields leave a successful GET', () => {
  assert.deepEqual(parseGuardianStatus({ ...status, playerId: 'other', seed: 42 }, grantId), status);
  assert.deepEqual(parseGuardianStatus({ ...status, ruleVersion: 'portal-guardian-showdown-v1' },
    grantId).ruleVersion, 'portal-guardian-showdown-v1');
  assert.equal(parseGuardianStatus({ ...status, playerHealth: 0 }, grantId).playerHealth, 0);
});
test('status refuses cross-grant and malformed UUID replies', () => {
  bad(() => parseGuardianStatus({ ...status, grantId: other }, grantId));
  bad(() => parseGuardianStatus({ ...status, grantId: 'not-guid' }, grantId));
  bad(() => parseGuardianStatus(status, 'not-guid'));
  bad(() => parseGuardianStatus({ ...status, grantId: null }, grantId));
});
test('status rejects fake HP, non-integer turns, future rules and contradictory victories', () => {
  for (const delta of [
    { turn: -1 }, { turn: 13 }, { turn: 0.5 },
    { guardianHealth: 7 }, { guardianHealth: -1 },
    { guardianMaxHealth: 0 }, { playerHealth: 21 },
    { playerHealth: NaN }, { playerMaxHealth: 0 },
    { outcome: 'victory' }, { outcome: 'retreat', guardianHealth: 0 },
    { outcome: 'ongoing', guardianHealth: 0 },
    { outcome: 'ongoing', turn: 12 }, { ruleVersion: 'guardian-v999' },
  ]) bad(() => parseGuardianStatus({ ...status, ...delta }, grantId));
  assert.equal(parseGuardianStatus({ ...status, turn: 12, outcome: 'retreat' },
    grantId).outcome, 'retreat');
});
test('confirmed turn must echo the request identity and strips untrusted claims', () => {
  assert.deepEqual(parseGuardianTurn({ ...turn, attackerId: other, rewardKey: 'fake' },
    request), turn);
  assert.equal(parseGuardianTurn({ ...turn, grantId: grantId.toUpperCase(),
    idempotencyKey: key.toUpperCase(), replayed: true }, request).replayed, true);
});
test('turn rejects wrong owner grant, replay UUID, action and expected turn', () => {
  for (const delta of [
    { grantId: other }, { idempotencyKey: other }, { idempotencyKey: 'bad' },
    { turn: 2 }, { turn: 0 }, { action: 'feint' }, { action: 'strike-but-different' },
    { guardianAction: 'feint' }, { replayed: 'false' },
  ]) bad(() => parseGuardianTurn({ ...turn, ...delta }, request));
  bad(() => parseGuardianTurn(turn, { ...request, expectedTurn: 1 }));
  bad(() => parseGuardianTurn(turn, { ...request, expectedTurn: 12 }));
});
test('turn rejects inflated damage, impossible HP and contradictory terminal outcomes', () => {
  for (const delta of [
    { damageDealt: -1 }, { damageDealt: 2.5 }, { damageDealt: 7 },
    { damageTaken: 21 }, { guardianHealth: 7 }, { playerHealth: -1 },
    { outcome: 'victory', guardianHealth: 5 },
    { outcome: 'ongoing', guardianHealth: 0 },
    { turn: 12, outcome: 'ongoing' },
  ]) bad(() => parseGuardianTurn({ ...turn, ...delta }, request));
  const terminal = { ...turn, turn: 12, guardianHealth: 0, outcome: 'victory' };
  assert.equal(parseGuardianTurn(terminal, { ...request, expectedTurn: 11 }).outcome, 'victory');
});
test('history is bounded, sequential, private and preserves seven decimal timestamps', () => {
  assert.deepEqual(parseGuardianHistory([]), []);
  assert.deepEqual(parseGuardianHistory([{ ...historyRow, playerId: other, portalSeed: 12 }]),
    [historyRow]);
  const later = { ...historyRow, turn: 2, guardianHealth: 4,
    occurredAtUtc: '2026-11-07T12:00:00.1234568Z' };
  assert.deepEqual(parseGuardianHistory([historyRow, later]), [historyRow, later]);
});
test('history rejects duplicate, skipped or backdated concurrent turns', () => {
  const later = { ...historyRow, turn: 2, guardianHealth: 4,
    occurredAtUtc: '2026-11-07T12:00:00.1234566Z' };
  bad(() => parseGuardianHistory([historyRow, later]), 'guardian_history_unavailable');
  for (const invalid of [
    [{ ...historyRow, turn: 2 }],
    [historyRow, { ...later, occurredAtUtc: historyRow.occurredAtUtc, turn: 3 }],
    [historyRow, { ...later, occurredAtUtc: '2026-02-31T12:00:00Z' }],
    [historyRow, { ...later, occurredAtUtc: '2026-11-07T12:00:00' }],
    [{ ...historyRow, guardianAction: 'feint' }],
    [{ ...historyRow, playerHealth: -1 }],
    [historyRow, { ...later, outcome: 'victory', guardianHealth: 4 }],
    Array.from({ length: 13 }, (_, i) => ({ ...historyRow, turn: i + 1 })),
  ]) bad(() => parseGuardianHistory(invalid), 'guardian_history_unavailable');
});
test('history cannot append a new turn after a terminal victory or retreat', () => {
  for (const outcome of ['victory', 'retreat']) {
    const terminal = { ...historyRow, outcome, guardianHealth: outcome === 'victory' ? 0 : 5 };
    assert.equal(parseGuardianHistory([terminal]).length, 1);
    bad(() => parseGuardianHistory([terminal, { ...historyRow, turn: 2 }]),
      'guardian_history_unavailable');
  }
});

test('server-serialized Guardian turns may share the same canonical timestamp after lock contention', () => {
  const second = { ...historyRow, turn: 2, guardianHealth: 3, playerHealth: 18,
    damageDealt: 2, damageTaken: 2,
    occurredAtUtc: historyRow.occurredAtUtc };
  assert.deepEqual(parseGuardianHistory([historyRow, second]), [historyRow, second]);
  const offsetEquivalent = { ...second,
    occurredAtUtc: '2026-11-07T13:00:00.1234567+01:00' };
  assert.deepEqual(parseGuardianHistory([historyRow, offsetEquivalent]),
    [historyRow, offsetEquivalent]);
  // The backend must never publish an earlier receipt, even by one .NET tick.
  const rolledBack = { ...second, occurredAtUtc: '2026-11-07T12:00:00.1234566Z' };
  bad(() => parseGuardianHistory([historyRow, rolledBack]), 'guardian_history_unavailable');
});
