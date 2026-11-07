/** Fail closed if Playwright's JSON reporter shows no executed passing tests. */
export function verifyPassedPlaywrightReport(json, source = 'Playwright report') {
  let data;
  try { data = JSON.parse(json); }
  catch { throw new Error(`Invalid ${source}: malformed JSON`); }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !Array.isArray(data.suites) || data.suites.length < 1 ||
      !data.stats || typeof data.stats !== 'object')
    throw new Error(`Invalid ${source}: no suites or test counters`);
  const { expected, unexpected, flaky, skipped } = data.stats;
  if (!Number.isSafeInteger(expected) || expected < 1 ||
      !Number.isSafeInteger(unexpected) || unexpected !== 0 ||
      !Number.isSafeInteger(flaky) || flaky !== 0 ||
      !Number.isSafeInteger(skipped) || skipped !== 0 ||
      (Array.isArray(data.errors) && data.errors.length > 0)) {
    throw new Error(`Incomplete ${source}: expected=${expected}, ` +
      `unexpected=${unexpected}, flaky=${flaky}, skipped=${skipped}`);
  }
  return { passed: expected };
}
