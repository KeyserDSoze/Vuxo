import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerActionGate } from '../src/features/inventory/ownerActionGate.ts';

test('no guest can acquire a mutating intention', () => {
  const gate = createOwnerActionGate(null);
  assert.equal(gate.acquire(null), null);
  assert.equal(gate.acquire('someone'), null);
});
test('only the matching session can start an action', () => {
  const gate = createOwnerActionGate('owner-a');
  assert.equal(gate.acquire('owner-b'), null);
  const ticket = gate.acquire('owner-a');
  assert.equal(ticket, 1);
  assert.equal(gate.isCurrent(ticket, 'owner-a'), true);
  assert.equal(gate.isCurrent(ticket, 'owner-b'), false);
});
test('healing and equipment cannot acquire overlapping actions', () => {
  const gate = createOwnerActionGate('owner-a');
  const heal = gate.acquire('owner-a');
  assert.equal(gate.acquire('owner-a'), null);
  assert.equal(gate.release(heal), true);
  const equipment = gate.acquire('owner-a');
  assert.equal(equipment, 2);
});
test('a released action cannot publish a late result or free another lease', () => {
  const gate = createOwnerActionGate('owner-a');
  const first = gate.acquire('owner-a');
  assert.equal(gate.release(first), true);
  const second = gate.acquire('owner-a');
  assert.equal(gate.isCurrent(first, 'owner-a'), false);
  assert.equal(gate.release(first), false);
  assert.equal(gate.isCurrent(second, 'owner-a'), true);
});
test('logout/account switch immediately invalidates a running action', () => {
  const gate = createOwnerActionGate('owner-a');
  const pending = gate.acquire('owner-a');
  assert.equal(gate.isCurrent(pending, null), false);
  assert.equal(gate.isCurrent(pending, 'owner-b'), false);
  gate.dispose();
  assert.equal(gate.isCurrent(pending, 'owner-a'), false);
  assert.equal(gate.acquire('owner-a'), null);
  assert.equal(gate.release(pending), false);
});
test('a new keyed owner view starts with an independent lease', () => {
  const old = createOwnerActionGate('owner-a');
  const oldTicket = old.acquire('owner-a');
  old.dispose();
  const next = createOwnerActionGate('owner-b');
  assert.equal(next.acquire('owner-a'), null);
  const newTicket = next.acquire('owner-b');
  assert.equal(newTicket, 1);
  assert.equal(next.isCurrent(newTicket, 'owner-b'), true);
  assert.equal(old.isCurrent(oldTicket, 'owner-a'), false);
});
