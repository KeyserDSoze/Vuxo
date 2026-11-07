/**
 * Checks a server DateTimeOffset-style timestamp without letting Date.parse
 * silently roll over impossible dates. Explicit timezone and up to seven
 * fractional digits (100ns .NET precision) are supported.
 */
export function isValidServerTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59) return false;
  const offset = match[7];
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}
\n/**
 * Compare instants at .NET DateTimeOffset's 100 ns precision, not the
 * millisecond precision of Date.parse. Both arguments must be valid.
 */
export function compareServerTimestamps(left: string, right: string): -1 | 0 | 1 {
  if (!isValidServerTimestamp(left) || !isValidServerTimestamp(right)) {
    throw new Error('invalid_server_timestamp');
  }
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;

  // Date.parse truncates fractions beyond three digits. Compare the last
  // four 100-ns digits separately to avoid losing order within a millisecond.
  const remainder = (value: string): number => {
    const fraction = /\.(\d{1,7})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
    return Number(fraction.padEnd(7, '0').slice(3));
  };
  const leftRemainder = remainder(left);
  const rightRemainder = remainder(right);
  return leftRemainder === rightRemainder ? 0 : leftRemainder < rightRemainder ? -1 : 1;
}
