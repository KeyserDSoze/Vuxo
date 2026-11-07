/**
 * Verify the real .NET VSTest TRX counters, not the process exit code alone.
 * A runner can exit successfully after discovering zero tests or skipping all
 * PostgreSQL facts. Never claim a green release gate in those cases.
 */
export function verifyPassedTrx(xml, source = 'TRX report') {
  if (typeof xml !== 'string') throw new Error(`Invalid ${source}: not a text report`);
  const match = /<(?:[A-Za-z][\w.-]*:)?Counters\b([^>]*)\/?\s*>/i.exec(xml);
  if (!match) throw new Error(`Invalid ${source}: missing <Counters>`);
  const values = Object.fromEntries(
    [...match[1].matchAll(/([A-Za-z]+)\s*=\s*['"](\d+)['"]/g)]
      .map(([, key, value]) => [key.toLowerCase(), Number(value)]),
  );
  const { total, executed, passed, failed, notexecuted } = values;
  const extraFailures = ['error', 'timeout', 'aborted', 'inconclusive',
    'notrunnable', 'warning', 'disconnected', 'pending', 'inprogress']
    .some(key => (values[key] ?? 0) > 0);
  if (!Number.isSafeInteger(total) || total < 1 ||
      !Number.isSafeInteger(executed) || executed !== total ||
      !Number.isSafeInteger(passed) || passed !== total ||
      failed !== 0 || notexecuted !== 0 || extraFailures) {
    throw new Error(`Incomplete ${source}: total=${total}, passed=${passed}, ` +
      `executed=${executed}, failed=${failed}, notExecuted=${notexecuted}`);
  }
  return { total, passed };
}
