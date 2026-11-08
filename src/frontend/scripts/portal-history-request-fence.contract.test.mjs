import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalHistoryRequestFence } from '../src/features/refuge/portalHistoryRequestFence.ts';

test('the current request ticket can publish once it finishes', () => {
  const fence = createPortalHistoryRequestFence();
  const first = fence.begin();
  assert.equal(fence.accepts(first), true);
});

test('a mode change synchronously invalidates the old response before React effects run', () => {
  const fence = createPortalHistoryRequestFence();
  const old = fence.begin();
  fence.invalidate();
  assert.equal(fence.accepts(old), false);
  assert.equal(fence.accepts(fence.begin()), true);
});

test('refresh invalidates even when the old transport ignores AbortSignal', async () => {
  const fence = createPortalHistoryRequestFence();
  const old = fence.begin();
  let resolveOld;
  const pending = new Promise(resolve => { resolveOld = resolve; });
  fence.invalidate();
  resolveOld('stale history');
  assert.equal(await pending, 'stale history');
  assert.equal(fence.accepts(old), false);
});

test('a newer request supersedes the older ticket without relying on cancellation', () => {
  const fence = createPortalHistoryRequestFence();
  const first = fence.begin();
  const second = fence.begin();
  assert.equal(fence.accepts(first), false);
  assert.equal(fence.accepts(second), true);
});

test('an aborted request is always blocked, even if its generation is still current', () => {
  const fence = createPortalHistoryRequestFence();
  const ticket = fence.begin();
  const controller = new AbortController();
  assert.equal(fence.accepts(ticket, controller.signal), true);
  controller.abort();
  assert.equal(fence.accepts(ticket, controller.signal), false);
});

test('the fence rejects fabricated, missing or malformed generation tickets', () => {
  const fence = createPortalHistoryRequestFence();
  fence.begin();
  for (const ticket of [0, -1, 2, Number.NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])
    assert.equal(fence.accepts(ticket), false);
});

test('one account does not share a fence or invalidate another account requests', () => {
  const accountA = createPortalHistoryRequestFence();
  const accountB = createPortalHistoryRequestFence();
  const a = accountA.begin();
  const b = accountB.begin();
  accountA.invalidate();
  assert.equal(accountA.accepts(a), false);
  assert.equal(accountB.accepts(b), true);
});

test('a rapid completed-to-outcomes-to-completed sequence only accepts the final request', () => {
  const fence = createPortalHistoryRequestFence();
  const original = fence.begin();
  fence.invalidate(); // first summary jump
  const outcomes = fence.begin();
  fence.invalidate(); // second summary jump before prior fetch settles
  const finalCompleted = fence.begin();
  assert.equal(fence.accepts(original), false);
  assert.equal(fence.accepts(outcomes), false);
  assert.equal(fence.accepts(finalCompleted), true);
});

test('a transport error from an invalidated request cannot change error/loading UI', () => {
  const fence = createPortalHistoryRequestFence();
  const old = fence.begin();
  fence.invalidate();
  let showsError = false;
  let clearsLoading = false;
  if (fence.accepts(old)) showsError = true;
  if (fence.accepts(old)) clearsLoading = true;
  assert.equal(showsError, false);
  assert.equal(clearsLoading, false);
});
