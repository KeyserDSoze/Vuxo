/**
 * Camera-only presentation policy. Never changes authoritative world tiles,
 * physics, portal hit areas, character position, or input normalization.
 * A phone keeps 1:1 scale to preserve its narrow exploration field; taller
 * desktop/ultrawide canvases enlarge avatars while retaining context.
 */
export const WORLD_TILE_PIXELS = 32
export const WORLD_MAX_CAMERA_ZOOM = 1.9

export function computeWorldCameraZoom(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1
  if (width < 600) return 1

  const target = width < 1024
    ? Math.min(1.16, Math.max(1, height / 800))
    : Math.min(WORLD_MAX_CAMERA_ZOOM, Math.max(1.15, height / 720 * 1.12))

  // A small browser or side-by-side window still needs at least 14x12
  // visible world tiles. Keep the lower bound at 1 on narrow layouts.
  const tileBound = Math.max(1, Math.min(
    width / (14 * WORLD_TILE_PIXELS),
    height / (12 * WORLD_TILE_PIXELS),
  ))
  const safe = Math.min(target, tileBound)
  // Coarse stable steps prevent resize jitter during fullscreen transitions.
  return Math.max(1, Math.floor((safe + 1e-8) * 20) / 20)
}
