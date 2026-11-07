import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerActionGate } from '../src/features/inventory/ownerActionGate.ts';
import { isCurrentOwnerRead, readForCurrentOwner } from '../src/features/auth/ownerReadFence.ts';

const storage = new Map();
globalThis.window = { dispatchEvent() {} };
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};
function login(token) {
  storage.clear();
  if (!token) return;
  storage.set('vuxo.accessToken', token);
  storage.set('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
  storage.set('vuxo.auth.user', JSON.stringify({ id: token, displayName: token, email: null }));
}
function deferred() {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return { promise, resolve };
}

test('a delayed rune GET cannot be published under a replacement account', async () => {
  login('owner-a');
  const pending = deferred();
  const result = readForCurrentOwner('owner-a', () => pending.promise);
  login('owner-b');
  pending.resolve({ grantId: 'owner-a-private-sequence' });
  await assert.rejects(result, { message: 'owner_read_session_changed' });
});

test('portal action lease blocks two synchronous submit clicks before React renders', () => {
  login('owner-a');
  const gate = createOwnerActionGate('owner-a');
  const first = gate.acquire('owner-a');
  assert.equal(typeof first, 'number');
  assert.equal(gate.acquire('owner-a'), null);
  assert.equal(gate.isCurrent(first, 'owner-a'), true);
  assert.equal(gate.release(first), true);
  assert.equal(typeof gate.acquire('owner-a'), 'number');
});

test('owner-A submitted result cannot be confirmed after owner-B signs in', async () => {
  login('owner-a');
  const gate = createOwnerActionGate('owner-a');
  const ticket = gate.acquire('owner-a');
  const response = deferred();
  const pending = response.promise.then(() =>
    gate.isCurrent(ticket, localStorage.getItem('vuxo.accessToken')));
  login('owner-b');
  response.resolve({ id: 'old-grant', reward: 'old-item' });
  assert.equal(await pending, false);
  assert.equal(gate.acquire('owner-b'), null);
  gate.dispose();
  const newGate = createOwnerActionGate('owner-b');
  assert.equal(newGate.acquire('owner-a'), null);
  assert.equal(newGate.acquire('owner-b'), 1);
});

test('logout and expired session deny both preview and POST intentions', async () => {
  login('owner-a');
  const gate = createOwnerActionGate('owner-a');
  login(null);
  assert.equal(isCurrentOwnerRead('owner-a'), false);
  assert.equal(gate.acquire(null), null);
  let called = false;
  await assert.rejects(readForCurrentOwner('owner-a', async () => { called = true; }),
    { message: 'owner_read_session_changed' });
  assert.equal(called, false);
  login('owner-a');
  storage.set('vuxo.auth.expiresAtUtc', '2000-01-01T00:00:00Z');
  assert.equal(isCurrentOwnerRead('owner-a'), false);
});
