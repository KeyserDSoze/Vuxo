/**
 * A synchronous generation fence for owner-scoped Journal history requests.
 * AbortController alone cannot stop a response that settles before React runs
 * the old effect cleanup, nor a mocked transport that ignores abort.
 *
 * Every request gets a monotonically increasing ticket; refresh, mode changes
 * and summary navigation invalidate outstanding tickets immediately, before
 * React has applied its next state/effect. Never store tokens or user data here.
 */
export function createPortalHistoryRequestFence() {
  let generation = 0;
  return {
    begin(): number {
      return ++generation;
    },
    invalidate(): void {
      generation++;
    },
    accepts(ticket: number, signal?: AbortSignal): boolean {
      return Number.isSafeInteger(ticket) && ticket > 0 &&
        ticket === generation && !signal?.aborted;
    },
  };
}
