import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalHistoryNavigationGate } from '../src/features/refuge/portalHistoryNavigationGate.ts';

const advance = (gate, page, more = true, loading = false, error = false) =>
  gate.next(page, more, loading, error);

test('two same-tick Load More clicks cannot skip page 2', () => {
  const gate = createPortalHistoryNavigationGate();
  assert.equal(advance(gate, 1), 2);
  assert.equal(advance(gate, 1), null);
  assert.equal(advance(gate, 1), null);
});

test('after page 2 is rendered, exactly one next page may be requested', () => {
  const gate = createPortalHistoryNavigationGate();
  assert.equal(advance(gate, 1), 2);
  assert.equal(advance(gate, 2), 3);
  assert.equal(advance(gate, 2), null);
  assert.equal(advance(gate, 3), 4);
});

test('refuses loading, errored, and terminal states without consuming page number', () => {
  const gate = createPortalHistoryNavigationGate();
  assert.equal(advance(gate, 1, false), null);
  assert.equal(advance(gate, 1, true, true), null);
  assert.equal(advance(gate, 1, true, false, true), null);
  assert.equal(advance(gate, 1), 2);
});

test('never exceeds backend maximum page 1000', () => {
  const gate = createPortalHistoryNavigationGate();
  for (let p = 1; p < 1000; p++) assert.equal(advance(gate, p), p + 1);
  assert.equal(advance(gate, 1000), null);
});

test('refresh resets the bookmark to page one even after a pending page request', () => {
  const gate = createPortalHistoryNavigationGate();
  assert.equal(advance(gate, 1), 2);
  gate.reset();
  assert.equal(advance(gate, 1), 2);
  assert.equal(advance(gate, 1), null);
});

test('changing history mode resets the fence and prevents a stale page click', () => {
  const gate = createPortalHistoryNavigationGate();
  assert.equal(advance(gate, 1), 2);
  assert.equal(advance(gate, 2), 3);
  gate.reset();
  assert.equal(advance(gate, 3), null);
  assert.equal(advance(gate, 1), 2);
});

test('rejects invalid page values instead of queuing a malformed request', () => {
  const gate = createPortalHistoryNavigationGate();
  for (const page of [0, -1, 1.5, NaN, Infinity, 1001, Number.MAX_SAFE_INTEGER])
    assert.equal(advance(gate, page), null);
  assert.equal(advance(gate, 1), 2);
});

test('new session gets an independent pagination fence', () => {
  const ownerA = createPortalHistoryNavigationGate();
  const ownerB = createPortalHistoryNavigationGate();
  assert.equal(advance(ownerA, 1), 2);
  assert.equal(advance(ownerB, 1), 2);
  assert.equal(advance(ownerA, 1), null);
  assert.equal(advance(ownerB, 1), null);
});
