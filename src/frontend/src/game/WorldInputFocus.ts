// Shared HTML-focus boundary for Phaser movement and world keyboard
// shortcuts (fullscreen F and HUD H). This is a UI affordance, not a game-authority check.
const INTERACTIVE_WORLD_UI = [
  'input', 'textarea', 'select', 'button', 'a[href]', 'summary',
  '[contenteditable]', '[role="dialog"]', '[role="button"]',
  '[role="link"]', '[role="textbox"]', '[role="combobox"]',
  '[role="menuitem"]', '[role="tab"]', '[role="switch"]',
  '[role="checkbox"]', '[role="radio"]', '[role="slider"]',
].join(', ')

export function isWorldInteractiveFocus(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_WORLD_UI) !== null
}
