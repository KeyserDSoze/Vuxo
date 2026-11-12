// Shared HTML-focus boundary for Phaser movement and world keyboard
// shortcuts (fullscreen F, HUD H, radar R and help ?). Display-only,
// never a substitute for server-owned game authority.
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

/** Common editing/focus protection; only the ? glyph may require Shift. */
function isWorldDisplayShortcutSafe(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.repeat && !event.isComposing
    && !event.altKey && !event.ctrlKey && !event.metaKey
    && !isWorldInteractiveFocus(event.target)
}

/** F/H/R are unmodified keys: Shift+letter never toggles world overlays. */
export function isUnmodifiedWorldShortcut(event: KeyboardEvent): boolean {
  return !event.shiftKey && isWorldDisplayShortcutSafe(event)
}

/** The question-mark glyph is layout dependent; do not hard-code Slash/Shift. */
export function isWorldHelpShortcut(event: KeyboardEvent): boolean {
  return event.key === '?' && isWorldDisplayShortcutSafe(event)
}
