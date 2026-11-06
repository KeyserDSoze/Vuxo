import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCharacterRestResult, parseCharacterItemHealResult,
  requireEquipConfirmed, requireUnequipConfirmed,
} from '../src/ownerMutationContracts.ts';

const key = '11111111-1111-4111-8111-111111111111';
const otherKey = '22222222-2222-4222-8222-222222222222';
const grantId = '33333333-3333-4333-8333-333333333333';
const otherGrant = '44444444-4444-4444-8444-444444444444';
const health = { previousHealth: 7, currentHealth: 12, maxHealth: 20, restoredHealth: 5 };
const rest = { ...health, idempotencyKey: key, restedAtUtc: '2026-11-05T12:00:00Z',
  nextRestAtUtc: '2026-11-05T12:30:00Z', replayed: false };
const heal = { ...health, grantId, idempotencyKey: key,
  consumedAtUtc: '2026-11-05T12:00:00Z', replayed: false };
const badRest = value => assert.throws(() => parseCharacterRestResult(value, key), { message: 'rest_invalid_response' });
const badHeal = value => assert.throws(() => parseCharacterItemHealResult(value, grantId, key), { message: 'heal_invalid_response' });

test('rest accepts exact server receipt and replay without applying HP twice', () => {
  assert.deepEqual(parseCharacterRestResult(rest, key), rest);
  assert.equal(parseCharacterRestResult({ ...rest, replayed: true }, key).replayed, true);
});
test('rest rejects mismatched idempotency key including valid other UUID', () => {
  badRest({ ...rest, idempotencyKey: otherKey });
  badRest({ ...rest, idempotencyKey: null });
});
test('rest rejects impossible health deltas, zero restore and negative HP', () => {
  for (const patch of [{ currentHealth: 13 }, { restoredHealth: 0 }, { previousHealth: 0 },
    { maxHealth: 10 }, { currentHealth: 21 }, { restoredHealth: -1 },
    { previousHealth: 7.5 }, { previousHealth: '7' }]) badRest({ ...rest, ...patch });
});
test('rest requires coherent timestamps and boolean replay marker', () => {
  for (const patch of [{ nextRestAtUtc: rest.restedAtUtc },
    { nextRestAtUtc: '2026-11-05T11:00:00Z' }, { restedAtUtc: 'not-a-date' },
    { replayed: 'true' }]) badRest({ ...rest, ...patch });
});
test('rest strips untrusted server extras instead of exposing claims', () => {
  const parsed = parseCharacterRestResult({ ...rest, rewardKey: 'fake', isReady: true }, key);
  assert.equal('rewardKey' in parsed, false);
  assert.equal('isReady' in parsed, false);
});
test('healing accepts real grant/key receipt and replay', () => {
  assert.deepEqual(parseCharacterItemHealResult(heal, grantId, key), heal);
  assert.equal(parseCharacterItemHealResult({ ...heal, replayed: true }, grantId, key).replayed, true);
});
test('healing rejects correct HP values linked to wrong grant or replay UUID', () => {
  badHeal({ ...heal, grantId: otherGrant });
  badHeal({ ...heal, idempotencyKey: otherKey });
  badHeal({ ...heal, grantId: 'invalid-id' });
});
test('healing rejects malformed or inconsistent health and consumption time', () => {
  for (const patch of [{ currentHealth: 11 }, { restoredHealth: 0 }, { maxHealth: 0 },
    { previousHealth: 0 }, { currentHealth: 25 }, { replayed: 1 },
    { consumedAtUtc: 'not-a-time' }]) badHeal({ ...heal, ...patch });
});
test('healing preserves genuine server reward without accepting speculative extras', () => {
  const parsed = parseCharacterItemHealResult({ ...heal, seed: 888, ownerId: 'other' }, grantId, key);
  assert.equal(parsed.currentHealth, 12);
  assert.equal('ownerId' in parsed, false);
  assert.equal('seed' in parsed, false);
});

test('equip confirmation requires the exact requested award to be present', () => {
  const equipped = { items: [{ slot: 'relic', grantId }] };
  assert.equal(requireEquipConfirmed(equipped, grantId), equipped);
  assert.throws(() => requireEquipConfirmed({ items: [] }, grantId), { message: 'equipment_invalid_response' });
  assert.throws(() => requireEquipConfirmed(equipped, otherGrant), { message: 'equipment_invalid_response' });
});
test('unequip confirmation requires the requested slot to be empty', () => {
  assert.equal(requireUnequipConfirmed({ items: [] }, 'relic').items.length, 0);
  assert.equal(requireUnequipConfirmed({ items: [{ slot: 'charm', grantId }] }, 'relic').items.length, 1);
  assert.throws(() => requireUnequipConfirmed({ items: [{ slot: 'relic', grantId }] }, 'relic'), {
    message: 'equipment_invalid_response',
  });
});
