import type { WorldPortalMarker } from './portalApi'

/**
 * The owner-only API is authoritative about grants, but JSON has no runtime
 * type checks. Phaser multiplies coordinates by 32 pixels per world tile:
 * null/strings may coerce to a fake origin and enormous values may overflow.
 */
export function isRenderableWorldPortalMarker(value: unknown): value is WorldPortalMarker {
  if (typeof value !== 'object' || value === null) return false
  const portal = value as Partial<WorldPortalMarker>
  return typeof portal.id === 'string' && portal.id.trim().length > 0 &&
    typeof portal.contentKey === 'string' && portal.contentKey.trim().length > 0 &&
    typeof portal.x === 'number' && typeof portal.y === 'number' &&
    Number.isFinite(portal.x) && Number.isFinite(portal.y) &&
    Number.isFinite(portal.x * 32) && Number.isFinite(portal.y * 32)
}

/** Preserve the first owner-granted marker for each canonical portal ID. */
export function normalizeWorldPortalMarkers(payload: readonly unknown[]): WorldPortalMarker[] {
  const ids = new Set<string>()
  const valid: WorldPortalMarker[] = []
  for (const item of payload) {
    if (!isRenderableWorldPortalMarker(item) || ids.has(item.id)) continue
    ids.add(item.id)
    valid.push(item)
  }
  return valid
}
