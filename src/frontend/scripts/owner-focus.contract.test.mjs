import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerFocusGate } from '../src/features/auth/ownerFocusGate.ts';

const input = (patch = {}) => ({ token: 'owner-a', visible: true, busy: false, now: 5000, ...patch });

test('guest cannot trigger owner requests', () => {
  assert.equal(createOwnerFocusGate(null).shouldRefresh(input({ token: null })), false);
});
test('foreign account cannot refresh previous owner data', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input({ token: 'owner-b' })), false);
  assert.equal(gate.shouldRefresh(input()), true);
});
test('hidden documents do not issue background owner refreshes', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input({ visible: false })), false);
  assert.equal(gate.shouldRefresh(input()), true);
});
test('mutating or loading views wait rather than race GETs against a POST', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input({ busy: true })), false);
  assert.equal(gate.shouldRefresh(input({ now: 5001 })), true);
});
test('focus and visibility events in the same burst trigger exactly one refresh', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input()), true);
  assert.equal(gate.shouldRefresh(input({ now: 5002 })), false);
  assert.equal(gate.shouldRefresh(input({ now: 6499 })), false);
  assert.equal(gate.shouldRefresh(input({ now: 6500 })), true);
});
test('invalid clock values never authorize owner requests', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input({ now: NaN })), false);
  assert.equal(gate.shouldRefresh(input({ now: Infinity })), false);
  assert.equal(gate.shouldRefresh(input({ now: 1000 })), true);
});
test('clock shifts backwards allow a new focus check instead of stalling forever', () => {
  const gate = createOwnerFocusGate('owner-a');
  assert.equal(gate.shouldRefresh(input({ now: 900000 })), true);
  assert.equal(gate.shouldRefresh(input({ now: 1000 })), true);
});
test('a new session gets its own gate with no inherited throttling', () => {
  const oldGate = createOwnerFocusGate('owner-a');
  const newGate = createOwnerFocusGate('owner-b');
  assert.equal(oldGate.shouldRefresh(input()), true);
  assert.equal(newGate.shouldRefresh(input({ token: 'owner-b' })), true);
  assert.equal(oldGate.shouldRefresh(input({ token: 'owner-b' })), false);
});

test('invalid throttle configuration does not disable burst suppression', () => {
  for (const interval of [NaN, Infinity, -1]) {
    const gate = createOwnerFocusGate('owner-a', interval);
    assert.equal(gate.shouldRefresh(input({ now: 5000 })), true);
    assert.equal(gate.shouldRefresh(input({ now: 5001 })), false);
    assert.equal(gate.shouldRefresh(input({ now: 6500 })), true);
  }
});
test('explicit zero throttle remains supported for callers that need it', () => {
  const gate = createOwnerFocusGate('owner-a', 0);
  assert.equal(gate.shouldRefresh(input({ now: 5000 })), true);
  assert.equal(gate.shouldRefresh(input({ now: 5000 })), true);
});
