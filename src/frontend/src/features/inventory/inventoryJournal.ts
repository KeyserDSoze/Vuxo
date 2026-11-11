export const INVENTORY_JOURNAL_PAGE_SIZE = 12

/**
 * A display-only window over the complete, owner-authoritative history.
 * No sorting, mutation, filtering, access control or API request happens here.
 */
export function pageInventoryJournal<T>(entries: readonly T[], visibleCount: number): {
  visible: T[]
  remaining: number
} {
  const limit = Number.isSafeInteger(visibleCount)
    ? Math.max(INVENTORY_JOURNAL_PAGE_SIZE, visibleCount)
    : INVENTORY_JOURNAL_PAGE_SIZE
  const visible = entries.slice(0, limit)
  return { visible, remaining: entries.length - visible.length }
}
