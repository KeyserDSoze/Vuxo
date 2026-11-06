/**
 * Per-session action lease shared by healing and equipment mutations.
 * Prevents two POST/DELETE intentions racing in one inventory view, and
 * invalidates asynchronous responses after logout, account switch or unmount.
 * Backend transactions remain the sole source of truth.
 */
export type OwnerActionGate = {
  acquire(currentToken: string | null): number | null;
  isCurrent(ticket: number, currentToken: string | null): boolean;
  release(ticket: number): boolean;
  dispose(): void;
};

export function createOwnerActionGate(ownerToken: string | null): OwnerActionGate {
  let currentTicket = 0;
  let activeTicket: number | null = null;
  let disposed = false;
  const authorized = (token: string | null) =>
    !disposed && ownerToken !== null && ownerToken === token;

  return {
    acquire(token) {
      if (!authorized(token) || activeTicket !== null) return null;
      currentTicket += 1;
      activeTicket = currentTicket;
      return activeTicket;
    },
    isCurrent(ticket, token) {
      return authorized(token) && activeTicket === ticket;
    },
    release(ticket) {
      if (disposed || ticket !== activeTicket) return false;
      activeTicket = null;
      return true;
    },
    dispose() {
      disposed = true;
      activeTicket = null;
      currentTicket += 1;
    },
  };
}
