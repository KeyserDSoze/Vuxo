import Phaser from 'phaser'

// Original, procedural VUXO portal art. This is a *presentation-only* layer:
// authorization, portal coordinates and interactions are owned by the API.
// No external assets, per-frame allocations, tweens or gameplay physics.
export type IllustratedPortal = {
  ring: Phaser.GameObjects.Arc
  arch: Phaser.GameObjects.Graphics
  halo: Phaser.GameObjects.Ellipse
  veil: Phaser.GameObjects.Ellipse
  shimmer: Phaser.GameObjects.Ellipse
  center: Phaser.GameObjects.Arc
  glyphs: Phaser.GameObjects.Graphics
  hovered: boolean
}

/**
 * A stone threshold with static engraved runes and a soft central light.
 * Only `ring` is interactive, with the original 19px local-radius hit area.
 */
export function createIllustratedPortal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onEnter: () => void,
): IllustratedPortal {
  const arch = scene.add.graphics().setDepth(5)
  // Grounding and stonework: no collision geometry is introduced.
  arch.fillStyle(0x071724, 0.65)
  arch.fillEllipse(x, y + 25, 75, 19)
  arch.lineStyle(9, 0x1e344e, 1)
  arch.strokeEllipse(x, y - 2, 56, 74)
  arch.lineStyle(5, 0x62718c, 0.98)
  arch.strokeEllipse(x, y - 2, 54, 72)
  arch.lineStyle(2, 0xd6c0f4, 0.86)
  arch.strokeEllipse(x, y - 2, 41, 58)
  arch.fillStyle(0x435b77, 1)
  arch.fillRoundedRect(x - 30, y + 21, 14, 8, 2)
  arch.fillRoundedRect(x + 16, y + 21, 14, 8, 2)
  arch.fillStyle(0x9be9de, 0.9)
  arch.fillTriangle(x - 4, y - 39, x + 4, y - 39, x, y - 47)

  // Decorative surfaces are never interactive. They cannot expand/shift the
  // click target or introduce owner-visible markers on their own.
  const halo = scene.add.ellipse(x, y - 2, 47, 63, 0x9d72f4, 0.2).setDepth(5.2)
  const veil = scene.add.ellipse(x, y, 34, 49, 0x251c53, 0.76).setDepth(5.5)
  const ring = scene.add.circle(x, y, 19, 0x7355be, 0.3)
    .setStrokeStyle(3, 0xe4d1ff, 1)
    .setDepth(6)
    .setInteractive({ useHandCursor: true })
  ring.on('pointerdown', onEnter)
  const shimmer = scene.add.ellipse(x, y, 17, 34, 0x9ae6ee, 0.24).setDepth(6.2)
  const center = scene.add.circle(x, y, 6, 0xc4a8f0, 0.92).setDepth(6.4)
  const glyphs = scene.add.graphics().setDepth(7)
  glyphs.lineStyle(1.7, 0xf0d5fa, 0.9)
  glyphs.lineBetween(x, y - 16, x + 5, y - 9)
  glyphs.lineBetween(x + 5, y - 9, x, y - 2)
  glyphs.lineBetween(x, y - 2, x - 5, y - 9)
  glyphs.lineBetween(x - 5, y - 9, x, y - 16)
  glyphs.lineBetween(x - 14, y + 5, x - 9, y + 5)
  glyphs.lineBetween(x + 9, y + 5, x + 14, y + 5)

  const portal: IllustratedPortal = { ring, arch, halo, veil, shimmer, center, glyphs, hovered: false }
  // Input stays on the same 19px Phaser ring. Decorative surfaces never
  // receive hit areas or permission to enter a grant on their own.
  ring.on('pointerover', () => { portal.hovered = true })
  ring.on('pointerout', () => { portal.hovered = false })
  return portal
}

/** Hide/show the seven decorative Phaser layers as one visual unit.
 * A portal's grant and its 19px interactive geometry are never destroyed by
 * camera culling. Do not replay an old hover when its art returns onscreen.
 */
export function setIllustratedPortalVisible(portal: IllustratedPortal, visible: boolean): void {
  if (portal.ring.visible === visible) return
  if (!visible) portal.hovered = false
  portal.ring.setVisible(visible)
  portal.arch.setVisible(visible)
  portal.halo.setVisible(visible)
  portal.veil.setVisible(visible)
  portal.shimmer.setVisible(visible)
  portal.center.setVisible(visible)
  portal.glyphs.setVisible(visible)
}

/** Animate only the non-interactive light, never the portal's input surface. */
export function updateIllustratedPortal(portal: IllustratedPortal, timeMs: number, reducedMotion: boolean): void {
  const pulse = reducedMotion ? 0.5 : (1 + Math.sin(timeMs / 360)) / 2
  // A hover emphasizes only decorative objects; the clickable ring does not
  // move or grow. Reduced motion freezes both the idle and hover states.
  portal.halo.setAlpha((reducedMotion ? 0.2 : 0.12 + pulse * 0.2) + (portal.hovered ? 0.18 : 0))
  portal.shimmer.setAlpha((reducedMotion ? 0.24 : 0.12 + pulse * 0.26) + (portal.hovered ? 0.16 : 0))
  portal.veil.setAlpha(portal.hovered ? 0.58 : 0.76)
  portal.center.setAlpha(portal.hovered ? 1 : 0.92)
  portal.center.setScale(reducedMotion ? 1 : 0.95 + pulse * 0.1 + (portal.hovered ? 0.1 : 0))
  // The hit area stays at scale=1, center=(x,y), radius=19, even while
  // the other layers breathe. No setScale is applied to portal.ring.
}

export function destroyIllustratedPortal(portal: IllustratedPortal): void {
  portal.ring.removeAllListeners('pointerover')
  portal.ring.removeAllListeners('pointerout')
  portal.ring.removeAllListeners('pointerdown')
  portal.ring.destroy()
  portal.arch.destroy()
  portal.halo.destroy()
  portal.veil.destroy()
  portal.shimmer.destroy()
  portal.center.destroy()
  portal.glyphs.destroy()
}
