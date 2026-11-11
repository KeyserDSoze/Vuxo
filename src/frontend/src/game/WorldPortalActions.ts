import type { WorldPortalMarker } from '../features/portals/portalApi'
import type { WorldPlayerSnapshot } from '../features/world/worldRealtime'

/**
 * Presentation only: preserve every owner-granted portal and its original
 * button number. The authoritative enter endpoint validates its grant and
 * proximity independently of this display order.
 */
export function rankWorldPortalActions<T extends WorldPortalMarker>(
  self: Pick<WorldPlayerSnapshot, 'x' | 'y'> | undefined,
  portals: readonly T[],
): Array<{ portal: T; number: number }> {
  const indexed = portals.map((portal, index) => ({ portal, number: index + 1 }))
  if (!self || !Number.isFinite(self.x) || !Number.isFinite(self.y)) return indexed
  const distance = (portal: T): number => {
    if (!portal || !Number.isFinite(portal.x) || !Number.isFinite(portal.y)) {
      return Number.POSITIVE_INFINITY
    }
    const d = Math.hypot(portal.x - self.x, portal.y - self.y)
    return Number.isFinite(d) ? d : Number.POSITIVE_INFINITY
  }
  return indexed.sort((a, b) => distance(a.portal) - distance(b.portal)
    || (a.portal.id < b.portal.id ? -1 : a.portal.id > b.portal.id ? 1 : 0)
    || a.number - b.number)
}
