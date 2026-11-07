/**
 * A synchronous fence for the Journal's Load More control. React state updates
 * are batched, so two clicks in one event loop can otherwise enqueue page 2
 * and page 3 against the same (page 1) history cursor.
 *
 * The gate stores the highest enqueued page. Only a click originating from
 * that exact currently rendered page may advance; a retry/mode switch resets
 * it back to page 1. This never authorizes reads; the backend still scopes
 * every cursor query to the authenticated owner.
 */
export function createPortalHistoryNavigationGate() {
  let enqueuedPage = 1;

  return {
    next(currentPage: number, hasMore: boolean, loading: boolean, error: boolean): number | null {
      if (!Number.isSafeInteger(currentPage) || currentPage < 1 ||
          currentPage >= 1000 || currentPage !== enqueuedPage ||
          !hasMore || loading || error) return null;
      enqueuedPage = currentPage + 1;
      return enqueuedPage;
    },
    reset(): void {
      enqueuedPage = 1;
    },
  };
}
