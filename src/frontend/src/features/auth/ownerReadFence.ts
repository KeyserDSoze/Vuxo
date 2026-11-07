import { readStoredSession } from './authSession.ts';

/**
 * Owner reads are not authorized just because a request started with a JWT.
 * An older view must neither send its next GET as the new account nor publish
 * an HTTP response after the owner changes, even if fetch ignores abort.
 */
export function isCurrentOwnerRead(ownerToken: string, signal?: AbortSignal): boolean {
  return Boolean(ownerToken && !signal?.aborted &&
    readStoredSession()?.accessToken === ownerToken);
}

export async function readForCurrentOwner<T>(
  ownerToken: string, read: () => Promise<T>, signal?: AbortSignal,
): Promise<T> {
  if (!isCurrentOwnerRead(ownerToken, signal)) throw new Error('owner_read_session_changed');
  const value = await read();
  if (!isCurrentOwnerRead(ownerToken, signal)) throw new Error('owner_read_session_changed');
  return value;
}
