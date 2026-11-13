// Deterministic integer hashing shared by every purely decorative world layer.
// A fixed (x, y) always yields the same value, so scenery never depends on
// join order, viewport or reconnects and never touches server-owned state.
export function cellNoise(x: number, y: number): number {
  const a = Math.imul(x ^ 0x45d9f3b, 0x27d4eb2d)
  const b = Math.imul(y ^ 0x119de1f3, 0x165667b1)
  const hash = a ^ b
  return (hash ^ (hash >>> 16)) >>> 0
}
