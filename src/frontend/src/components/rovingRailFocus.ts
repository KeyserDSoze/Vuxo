import type { KeyboardEvent } from 'react';

/**
 * Controller-style focus movement shared by the GameDeck and Refuge rails.
 * Works on actual focused controls only; never activates routes, modifies game
 * state or captures text input. Enter/Space and Tab remain fully native.
 */
export function moveRovingRailFocus(
  event: KeyboardEvent<HTMLElement>,
  itemSelector: string,
  horizontal: boolean,
  ignoreRepeat = false,
): void {
  if (event.defaultPrevented || event.nativeEvent.isComposing ||
      (ignoreRepeat && event.repeat) || event.altKey || event.ctrlKey ||
      event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(itemSelector)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(itemSelector));
  const current = items.indexOf(target);
  if (current < 0 || !items.length) return;
  let next: number | null = null;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if (event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')) next = (current + 1) % items.length;
  else if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) next = (current - 1 + items.length) % items.length;
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
}
