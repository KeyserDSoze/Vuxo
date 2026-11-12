/**
 * Camera-only presentation policy. Never changes authoritative world tiles,
 * physics, portal hit areas, character position, or input normalization.
 * A phone keeps 1:1 scale to preserve its narrow exploration field; taller
 * desktop/ultrawide canvases enlarge avatars while retaining context.
 */
export const WORLD_TILE_PIXELS = 32
export const WORLD_MAX_CAMERA_ZOOM = 1.9

// A one-pixel viewport resize should never cause a sudden jump from phone to
// tablet or tablet to desktop framing. Smoothstep is local to presentation:
// it does not interpolate world positions or modify Phaser hit geometry.
function smoothstep(start: number, end: number, width: number): number {
  const t = Math.max(0, Math.min(1, (width - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

export function computeWorldCameraZoom(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1

  const tabletTarget = Math.min(1.16, Math.max(1, height / 800))
  const desktopTarget = Math.min(WORLD_MAX_CAMERA_ZOOM,
    Math.max(1.15, height / 720 * 1.12))
  // Preserve canonical 320/390, 768, 1280, 1920 and ultrawide presets.
  // Crossfade *around* rather than *at* the former 600/1024 cutoffs;
  // quantization below still prevents camera scale flicker while dragging.
  const tabletBlend = smoothstep(560, 760, width)
  const desktopBlend = smoothstep(896, 1152, width)
  const base = 1 + (tabletTarget - 1) * tabletBlend
  const target = base + (desktopTarget - base) * desktopBlend

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
