import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentOwnerRead, readForCurrentOwner } from '../src/features/auth/ownerReadFence.ts';
import { readConsistentEquipmentSnapshot } from '../src/features/inventory/inventorySnapshotConsistency.ts';

const data = new Map();
globalThis.window = { dispatchEvent() {} };
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
};
function session(token) {
  data.clear();
  if (!token) return;
  data.set('vuxo.accessToken', token);
  data.set('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z');
  data.set('vuxo.auth.user', JSON.stringify({ id: token, displayName: token, email: null }));
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('a matching live owner can perform and publish a read', async () => {
  session('owner-a');
  let calls = 0;
  assert.equal(await readForCurrentOwner('owner-a', async () => { calls++; return 12; }), 12);
  assert.equal(calls, 1);
});
test('guest or obsolete owner cannot start even one private GET', async () => {
  session('owner-b');
  let calls = 0;
  for (const token of ['', 'owner-a']) {
    await assert.rejects(readForCurrentOwner(token, async () => { calls++; return 'secret'; }),
      { message: 'owner_read_session_changed' });
  }
  session(null);
  await assert.rejects(readForCurrentOwner('owner-b', async () => { calls++; return 'secret'; }),
    { message: 'owner_read_session_changed' });
  assert.equal(calls, 0);
});
test('late response cannot publish private data from another session', async () => {
  session('owner-a');
  const response = deferred();
  let calls = 0;
  const pending = readForCurrentOwner('owner-a', () => { calls++; return response.promise; });
  session('owner-b');
  response.resolve({ secret: 'a-private-inventory' });
  await assert.rejects(pending, { message: 'owner_read_session_changed' });
  assert.equal(calls, 1);
});
test('logout and expiry also revoke already pending reads', async () => {
  session('owner-a');
  const response = deferred();
  const pending = readForCurrentOwner('owner-a', () => response.promise);
  session(null);
  response.resolve('secret');
  await assert.rejects(pending, { message: 'owner_read_session_changed' });
  session('owner-a');
  data.set('vuxo.auth.expiresAtUtc', '2000-01-01T00:00:00Z');
  assert.equal(isCurrentOwnerRead('owner-a'), false);
});
test('an aborted signal blocks both request start and late publish', async () => {
  session('owner-a');
  const controller = new AbortController();
  const response = deferred();
  const pending = readForCurrentOwner('owner-a', () => response.promise, controller.signal);
  controller.abort();
  response.resolve('too late');
  await assert.rejects(pending, { message: 'owner_read_session_changed' });
  let called = false;
  await assert.rejects(readForCurrentOwner('owner-a', async () => { called = true; }, controller.signal),
    { message: 'owner_read_session_changed' });
  assert.equal(called, false);
});
test('a rejected request retains its original transport failure for the active owner', async () => {
  session('owner-a');
  await assert.rejects(readForCurrentOwner('owner-a', async () => {
    throw new Error('inventory_unavailable');
  }), { message: 'inventory_unavailable' });
});
test('inconsistent owner-A equipment snapshot cannot retry as owner B', async () => {
  session('owner-a');
  let reads = 0;
  const attempt = () => readForCurrentOwner('owner-a', async () => {
    reads++;
    session('owner-b'); // A different device/login changes the session between attempts.
    return [[{ itemKey: 'item.rune_shard.v1', quantity: 1,
      equippedQuantity: 1, availableGrantIds: [] }], { items: [] }];
  });
  await assert.rejects(readForCurrentOwner('owner-a', () =>
    readConsistentEquipmentSnapshot(attempt)), { message: 'owner_read_session_changed' });
  assert.equal(reads, 1); // The second GET pair must never use owner B's token.
});
