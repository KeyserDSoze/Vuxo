import { getStoredSessionSnapshot } from '../auth/authSession'
const ROLE_CLAIM_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'

export type AdminAccessState = 'administrator' | 'unauthenticated' | 'forbidden'

export function getAdminAccessState(nowSeconds = Date.now() / 1000): AdminAccessState {
  const session = getStoredSessionSnapshot(nowSeconds * 1000)
  if (!session) return 'unauthenticated'

  const payload = decodeJwtPayload(session.accessToken)
  if (!payload) return 'unauthenticated'
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return 'unauthenticated'

  const roleValue = payload.role ?? payload.roles ?? payload[ROLE_CLAIM_URI]
  const roles = Array.isArray(roleValue) ? roleValue : [roleValue]
  return roles.includes('Administrator') ? 'administrator' : 'forbidden'
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
    const json = decodeURIComponent(
      Array.from(atob(normalized + padding), character =>
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
      ).join(''),
    )
    const payload = JSON.parse(json) as unknown
    return payload !== null && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : null
  } catch {
    return null
  }
}
