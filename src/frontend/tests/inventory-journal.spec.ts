import { expect, test } from '@playwright/test'
import { INVENTORY_JOURNAL_PAGE_SIZE, pageInventoryJournal } from '../src/features/inventory/inventoryJournal'

test('journal windows preserve original owner sequence and reveal exact batches', () => {
  const entries = Array.from({ length: 29 }, (_, index) => ({
    grantId: 'owner-grant-' + index, consumed: index % 3 === 0,
  }))
  const first = pageInventoryJournal(entries, INVENTORY_JOURNAL_PAGE_SIZE)
  expect(first.visible).toEqual(entries.slice(0, 12))
  expect(first.visible[0]).toBe(entries[0])
  expect(first.remaining).toBe(17)
  const second = pageInventoryJournal(entries, 24)
  expect(second.visible).toEqual(entries.slice(0, 24))
  expect(second.remaining).toBe(5)
  const last = pageInventoryJournal(entries, 36)
  expect(last.visible).toEqual(entries)
  expect(last.remaining).toBe(0)
  expect(entries).toHaveLength(29)
  expect(entries.filter(entry => entry.consumed)).toHaveLength(10)
})

test('small, empty and invalid counts remain safe without mutating the source', () => {
  const entries = Object.freeze(['one', 'two', 'three'])
  expect(pageInventoryJournal(entries, 1)).toEqual({ visible: entries, remaining: 0 })
  expect(pageInventoryJournal(entries, Infinity)).toEqual({ visible: entries, remaining: 0 })
  expect(pageInventoryJournal(entries, NaN)).toEqual({ visible: entries, remaining: 0 })
  expect(pageInventoryJournal([], 12)).toEqual({ visible: [], remaining: 0 })
  expect(pageInventoryJournal(Array.from({ length: 20 }, (_, i) => i), -4).visible).toHaveLength(12)
})
