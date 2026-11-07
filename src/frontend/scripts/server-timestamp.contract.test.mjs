import test from 'node:test';
import assert from 'node:assert/strict';
import { compareServerTimestamps, isValidServerTimestamp } from '../src/features/contracts/serverTimestamp.ts';

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
test('full seven-digit precision catches reversed portal receipt chronology', () => {
  const grant = '2026-11-07T10:00:00.1234567Z';
  const earlier = '2026-11-07T10:00:00.1234566Z';
  const later = '2026-11-07T10:00:00.1234568Z';
  assert.equal(Date.parse(grant), Date.parse(earlier));
  assert.equal(compareServerTimestamps(earlier, grant), -1);
  assert.equal(compareServerTimestamps(later, grant), 1);
  assert.equal(compareServerTimestamps(grant, grant), 0);
});
test('timezone-equivalent timestamps compare equal at 100ns precision', () => {
  assert.equal(compareServerTimestamps('2024-02-29T08:00:00.1234567Z',
    '2024-02-29T09:00:00.1234567+01:00'), 0);
  assert.equal(compareServerTimestamps('2024-02-29T08:00:00.1234567Z',
    '2024-02-29T09:00:00.1234566+01:00'), 1);
});
test('comparison rejects invalid timestamps and the .NET-invalid year zero', () => {
  assert.equal(isValidServerTimestamp('0000-01-01T10:00:00Z'), false);
  assert.throws(() => compareServerTimestamps('0000-01-01T00:00:00Z',
    '2026-11-07T10:00:00Z'), { message: 'invalid_server_timestamp' });
  assert.throws(() => compareServerTimestamps('2026-02-31T10:00:00Z',
    '2026-11-07T10:00:00Z'), { message: 'invalid_server_timestamp' });
});
