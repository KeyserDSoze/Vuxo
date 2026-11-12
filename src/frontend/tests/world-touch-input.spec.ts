import { expect, test } from '@playwright/test'
import { HeldWorldTouchDirections } from '../src/game/WorldTouchInput'

test('two independent pointers produce a diagonal and release one axis at a time', () => {
  const held = new HeldWorldTouchDirections()
  expect(held.press(11, 1, 0)).toEqual({ horizontal: 1, vertical: 0 })
  expect(held.press(22, 0, -1)).toEqual({ horizontal: 1, vertical: -1 })
  expect(held.release(11)).toEqual({ horizontal: 0, vertical: -1 })
  expect(held.release(22)).toEqual({ horizontal: 0, vertical: 0 })
})

test('unknown and duplicate pointers do not replay or cancel movement', () => {
  const held = new HeldWorldTouchDirections()
  expect(held.press(3, 1, 0)).toEqual({ horizontal: 1, vertical: 0 })
  expect(held.press(3, 1, 0)).toBeNull()
  expect(held.release(9)).toBeNull()
  expect(held.press(-1, 0, 1)).toBeNull()
  expect(held.release(3)).toEqual({ horizontal: 0, vertical: 0 })
  expect(held.release(3)).toBeNull()
})

test('opposite directions cancel, while another held pointer keeps its direction', () => {
  const held = new HeldWorldTouchDirections()
  expect(held.press(1, 1, 0)).toEqual({ horizontal: 1, vertical: 0 })
  expect(held.press(2, -1, 0)).toEqual({ horizontal: 0, vertical: 0 })
  expect(held.release(1)).toEqual({ horizontal: -1, vertical: 0 })
  expect(held.press(3, -1, 0)).toEqual({ horizontal: -1, vertical: 0 })
  expect(held.release(2)).toEqual({ horizontal: -1, vertical: 0 })
  expect(held.release(3)).toEqual({ horizontal: 0, vertical: 0 })
})

test('reset discards held fingers and requires fresh pointerdown', () => {
  const held = new HeldWorldTouchDirections()
  held.press(9, 0, -1)
  held.press(10, 1, 0)
  held.clear()
  expect(held.release(9)).toBeNull()
  expect(held.release(10)).toBeNull()
  expect(held.press(11, 0, 1)).toEqual({ horizontal: 0, vertical: 1 })
  expect(held.release(11)).toEqual({ horizontal: 0, vertical: 0 })
})
