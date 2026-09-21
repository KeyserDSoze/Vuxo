export const ACCESS_TOKEN_STORAGE_KEY = 'vuxo.accessToken';
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

export function readStoredSession(now = Date.now()): VuxoSession | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const expiresAtUtc = localStorage.getItem(EXPIRY_STORAGE_KEY);
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);
  if (!accessToken || !expiresAtUtc || !rawUser) return null;

  const expiry = Date.parse(expiresAtUtc);
  if (!Number.isFinite(expiry) || expiry <= now) {
    clearStoredSession();
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as VuxoAuthUser;
    if (!user || typeof user.id !== 'string' || typeof user.displayName !== 'string') {
      clearStoredSession();
      return null;
    }
    return { accessToken, expiresAtUtc, user };
  } catch {
    clearStoredSession();
    return null;
  }
}

export function storeSession(session: VuxoSession): void {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
  localStorage.setItem(EXPIRY_STORAGE_KEY, session.expiresAtUtc);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
}

export function clearStoredSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(EXPIRY_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}
