export const ACCESS_TOKEN_STORAGE_KEY = 'vuxo.accessToken';
export const AUTH_SESSION_CHANGED_EVENT = 'vuxo:session-changed';
const USER_STORAGE_KEY = 'vuxo.auth.user';
const EXPIRY_STORAGE_KEY = 'vuxo.auth.expiresAtUtc';

export type VuxoAuthUser = {
  id: string;
  displayName: string;
  email: string | null;
};

export type VuxoSession = {
  accessToken: string;
  expiresAtUtc: string;
  user: VuxoAuthUser;
};

// Pure read: the navigation and route guards can query this during React rendering.
export function getStoredSessionSnapshot(now = Date.now()): VuxoSession | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const expiresAtUtc = localStorage.getItem(EXPIRY_STORAGE_KEY);
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);
  if (!accessToken || !expiresAtUtc || !rawUser) return null;

  const expiry = Date.parse(expiresAtUtc);
  if (!Number.isFinite(expiry) || expiry <= now) return null;

  try {
    const user = JSON.parse(rawUser) as VuxoAuthUser;
    if (!user || typeof user.id !== 'string' || typeof user.displayName !== 'string') return null;
    return { accessToken, expiresAtUtc, user };
  } catch {
    return null;
  }
}

export function readStoredSession(now = Date.now()): VuxoSession | null {
  const session = getStoredSessionSnapshot(now);
  if (!session && localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    && localStorage.getItem(EXPIRY_STORAGE_KEY) && localStorage.getItem(USER_STORAGE_KEY)) {
    clearStoredSession();
  }
  return session;
}

function notifySessionChanged(): void {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function storeSession(session: VuxoSession): void {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
  localStorage.setItem(EXPIRY_STORAGE_KEY, session.expiresAtUtc);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  notifySessionChanged();
}

export function clearStoredSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(EXPIRY_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  notifySessionChanged();
}

// storage fires in other tabs; the custom event covers same-tab login/logout.
// Focus and a bounded interval also revoke stale navigation after JWT expiry.
export function subscribeToSessionChanges(onChange: () => void): () => void {
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener('focus', onChange);
  const interval = window.setInterval(onChange, 30_000);
  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener('focus', onChange);
    window.clearInterval(interval);
  };
}
