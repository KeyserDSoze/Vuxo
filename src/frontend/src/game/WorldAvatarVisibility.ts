/** Presentation-only visibility guard for procedural multiplayer art.
 * The camera's actual worldView already accounts for zoom. World snapshots,
 * movement, identity, radar and gameplay must never be filtered by this.
 */
export const WORLD_AVATAR_OVERSCAN = 128

export type WorldCameraRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export function isWorldAvatarInView(
  view: WorldCameraRect,
  x: number,
  y: number,
  overscan = WORLD_AVATAR_OVERSCAN,
): boolean {
  if (![view.left, view.right, view.top, view.bottom, x, y, overscan].every(Number.isFinite) ||
      overscan < 0 || view.left > view.right || view.top > view.bottom) return false
  return x >= view.left - overscan && x <= view.right + overscan &&
    y >= view.top - overscan && y <= view.bottom + overscan
}
