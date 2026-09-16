import { getApiBaseUrl } from '../character/appearance'

const ACCESS_TOKEN_STORAGE_KEY = 'vuxo.accessToken'

export type AdminEventSummary = {
  eventId: string
  eventType: string
  visibilityScope: string
  playerId: string | null
  correlationId: string
  causationId: string | null
  ruleVersion: string
  occurredAtUtc: string
}

export type AdminEventDetail = AdminEventSummary & {
  payload: unknown
}

export type AdminEventPage = {
  total: number
  offset: number
  limit: number
  items: AdminEventSummary[]
}

export type AdminEventFilters = {
  playerId?: string
  eventType?: string
  correlationId?: string
  fromUtc?: string
  toUtc?: string
  offset?: number
  limit?: number
}

export type AdminOnlinePlayer = {
  playerId: string
  characterId: string
  characterName: string
  x: number
  y: number
  speedMultiplier: number
  revision: number
}

export class AdminApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code)
  }
}

export async function fetchAdminEvents(filters: AdminEventFilters, signal?: AbortSignal): Promise<AdminEventPage> {
  const params = new URLSearchParams()
  append(params, 'playerId', filters.playerId)
  append(params, 'eventType', filters.eventType)
  append(params, 'correlationId', filters.correlationId)
  append(params, 'fromUtc', filters.fromUtc)
  append(params, 'toUtc', filters.toUtc)
  params.set('offset', String(filters.offset ?? 0))
  params.set('limit', String(filters.limit ?? 20))

  return request<AdminEventPage>(`/api/admin/audit/events?${params.toString()}`, signal)
}

export async function fetchAdminEvent(eventId: string, signal?: AbortSignal): Promise<AdminEventDetail> {
  return request<AdminEventDetail>(`/api/admin/audit/events/${encodeURIComponent(eventId)}`, signal)
}

export async function fetchAdminOnlinePlayers(signal?: AbortSignal): Promise<AdminOnlinePlayer[]> {
  const response = await request<{ players: AdminOnlinePlayer[] }>('/api/admin/online-players', signal)
  return response.players
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  if (!token) throw new AdminApiError('admin_authentication_required', 401)

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    let code = response.status === 401
      ? 'admin_authentication_required'
      : response.status === 403
        ? 'admin_forbidden'
        : 'admin_request_failed'
    try {
      const payload = await response.json() as { code?: string }
      if (payload.code) code = payload.code
    } catch {
      // A stable local code is enough when the server did not return JSON.
    }
    throw new AdminApiError(code, response.status)
  }

  return response.json() as Promise<T>
}

function append(params: URLSearchParams, key: string, value?: string): void {
  const normalized = value?.trim()
  if (normalized) params.set(key, normalized)
}
