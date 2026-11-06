/**
 * Focus/visibility changes may fire together. A session-bound, trailing-free
 * gate prevents duplicate owner GETs and never refreshes during a mutation.
 * No browser or React dependencies: safe to test with the native Node runner.
 */
export type OwnerFocusAttempt = {
  token: string | null;
  visible: boolean;
  busy: boolean;
  now: number;
};

export function createOwnerFocusGate(ownerToken: string | null, minIntervalMs = 1500) {
  // Invalid caller configuration must never disable the anti-burst guard.
  const intervalMs = Number.isFinite(minIntervalMs) && minIntervalMs >= 0 ? minIntervalMs : 1500;
  let lastRefreshAt: number | null = null;
  return {
    shouldRefresh(attempt: OwnerFocusAttempt): boolean {
      if (!ownerToken || attempt.token !== ownerToken || !attempt.visible ||
          attempt.busy || !Number.isFinite(attempt.now)) return false;
      if (lastRefreshAt !== null && attempt.now >= lastRefreshAt &&
          attempt.now - lastRefreshAt < intervalMs) return false;
      lastRefreshAt = attempt.now;
      return true;
    },
  };
}
