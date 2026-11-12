/** Presentation-only pointer ownership for the mobile game D-pad.
 * Input IDs and directions are never positions or game authority; only the
 * resulting -1/0/1 movement intention is sent to the realtime client.
 */
export type WorldTouchIntent = { horizontal: number; vertical: number }

export class HeldWorldTouchDirections {
  private readonly pointers = new Map<number, WorldTouchIntent>()

  press(pointerId: number, horizontal: number, vertical: number): WorldTouchIntent | null {
    if (!Number.isSafeInteger(pointerId) || pointerId < 0) return null
    const next = { horizontal: Math.sign(horizontal), vertical: Math.sign(vertical) }
    const previous = this.pointers.get(pointerId)
    if (previous?.horizontal === next.horizontal && previous.vertical === next.vertical) return null
    this.pointers.set(pointerId, next)
    return this.intent()
  }

  release(pointerId: number): WorldTouchIntent | null {
    // A late/foreign pointerup must not cancel a still-held finger.
    if (!this.pointers.delete(pointerId)) return null
    return this.intent()
  }

  clear(): void {
    this.pointers.clear()
  }

  private intent(): WorldTouchIntent {
    let horizontal = 0
    let vertical = 0
    for (const direction of this.pointers.values()) {
      horizontal += direction.horizontal
      vertical += direction.vertical
    }
    // Opposite arrows cancel, matching the already-supported keyboard axes.
    return { horizontal: Math.sign(horizontal), vertical: Math.sign(vertical) }
  }
}
