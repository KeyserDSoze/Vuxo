// Cosmetic, client-only time of day. Every client derives the same light from
// the wall clock, so there is nothing to synchronise and nothing authoritative:
// it never affects visibility rules, movement, portals, rewards or the server.
export const AMBIENT_CYCLE_MS = 8 * 60_000

export type AmbientName = 'moonlit' | 'deep-night' | 'dawn' | 'twilight'
export type AmbientLight = { color: number; name: AmbientName }

type Keyframe = { at: number; color: number; name: AmbientName }

// A multiplied tint: 0xffffff would leave the painting untouched, so the whole
// cycle stays within the game's runic night identity.
const KEYFRAMES: readonly Keyframe[] = [
  { at: 0, color: 0xc4d4ff, name: 'moonlit' },
  { at: 0.25, color: 0x7685c4, name: 'deep-night' },
  { at: 0.5, color: 0xffcfb4, name: 'dawn' },
  { at: 0.75, color: 0xb08ad8, name: 'twilight' },
]

/** 0 inclusive to 1 exclusive; non-finite clocks fall back to the moonlit start. */
export function ambientPhase(nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 0
  const phase = (nowMs % AMBIENT_CYCLE_MS) / AMBIENT_CYCLE_MS
  return phase < 0 ? phase + 1 : phase
}

function lerpChannel(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * amount)
}

export function lerpColor(from: number, to: number, amount: number): number {
  const t = Math.min(1, Math.max(0, amount))
  return (lerpChannel((from >>> 16) & 255, (to >>> 16) & 255, t) << 16)
    | (lerpChannel((from >>> 8) & 255, (to >>> 8) & 255, t) << 8)
    | lerpChannel(from & 255, to & 255, t)
}

/** Smooth interpolation between keyframes, wrapping from twilight back to moonlit. */
export function ambientLight(phase: number): AmbientLight {
  const p = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0
  const index = Math.min(KEYFRAMES.length - 1, Math.floor(p * KEYFRAMES.length))
  const current = KEYFRAMES[index]
  const next = KEYFRAMES[(index + 1) % KEYFRAMES.length]
  const span = 1 / KEYFRAMES.length
  const amount = (p - current.at) / span
  // Smoothstep keeps each named moment readable instead of a constant drift.
  const eased = amount * amount * (3 - 2 * amount)
  return { color: lerpColor(current.color, next.color, eased), name: amount < 0.5 ? current.name : next.name }
}

/** Reduced motion freezes the scene at the moonlit keyframe. */
export const REDUCED_MOTION_AMBIENT: AmbientLight = { color: KEYFRAMES[0].color, name: 'moonlit' }
