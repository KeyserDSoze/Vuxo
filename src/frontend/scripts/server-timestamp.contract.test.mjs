import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidServerTimestamp } from '../src/features/contracts/serverTimestamp.ts';

test('valid UTC/offset .NET timestamps and leap dates', () => {
  for (const value of [
    '2024-02-29T10:20:30Z', '2000-02-29T10:20:30.1234567+01:30',
    '2026-11-07T01:02:03+14:00', '2026-11-07T01:02:03-14:00',
    '2026-11-07T01:02:03.1234567Z',
  ]) assert.equal(isValidServerTimestamp(value), true, value);
});
test('reject impossible dates, clock rollover, timezone omission and excess precision', () => {
  for (const value of [
    null, 42, '2026-02-29T12:00:00Z', '2026-02-31T12:00:00Z',
    '1900-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-00-01T00:00:00Z', '2026-11-07T24:00:00Z',
    '2026-11-07T12:60:00Z', '2026-11-07T12:00:60Z',
    '2026-11-07T12:00:00', '2026-11-07T12:00:00+14:01',
    '2026-11-07T12:00:00-15:00', '2026-11-07T12:00:00+01:60',
    '2026-11-07T12:00:00.12345678Z',
  ]) assert.equal(isValidServerTimestamp(value), false, String(value));
});
