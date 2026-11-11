import { expect, test } from '@playwright/test'
import { MAX_VISIBLE_WORLD_PLAYERS, selectWorldPresence } from '../src/game/WorldPresence'

const self = { playerId: 'self', characterName: 'Zelda', x: 0, y: 0 }

test('small parties preserve the existing alphabetical order and do not add a badge', () => {
  const players = [
    { playerId: 'a', characterName: 'Ada', x: 9, y: 1 },
    { playerId: 'b', characterName: 'Bran', x: 1, y: 1 },
    self,
  ]
  const result = selectWorldPresence(players, self.playerId)
  expect(result.visible).toEqual(players)
  expect(result.hiddenCount).toBe(0)
  expect(selectWorldPresence([], self.playerId)).toEqual({ visible: [], hiddenCount: 0 })
})

test('crowds always retain self and favor nearest server-owned positions', () => {
  const peers = Array.from({ length: 40 }, (_, index) => ({
    playerId: 'peer-' + String(index).padStart(2, '0'),
    characterName: 'Explorer ' + String(40 - index),
    x: index + 1,
    y: 0,
  }))
  const players = [...peers, self]
  const result = selectWorldPresence(players, self.playerId)
  expect(result.visible).toHaveLength(MAX_VISIBLE_WORLD_PLAYERS)
  expect(result.visible[0]).toBe(self)
  expect(result.visible.slice(1).map(player => player.playerId)).toEqual(
    Array.from({ length: MAX_VISIBLE_WORLD_PLAYERS - 1 }, (_, i) =>
      'peer-' + String(i).padStart(2, '0')))
  expect(result.hiddenCount).toBe(players.length - MAX_VISIBLE_WORLD_PLAYERS)
  expect(result.hiddenCount + result.visible.length).toBe(players.length)
})

test('ties are deterministic and invalid positions do not outrank valid peers', () => {
  const players = [
    ...Array.from({ length: 9 }, (_, index) => ({
      playerId: 'p' + index,
      characterName: 'Explorer',
      x: index < 2 ? -2 : index === 2 ? 2 : Number.NaN,
      y: 0,
    })),
    self,
  ]
  const visible = selectWorldPresence(players, self.playerId).visible
  expect(visible.map(player => player.playerId).slice(0, 4)).toEqual([
    'self', 'p0', 'p1', 'p2',
  ])
  expect(visible).toHaveLength(MAX_VISIBLE_WORLD_PLAYERS)
  expect(selectWorldPresence([...players].reverse(), self.playerId).visible.map(p => p.playerId))
    .toEqual(visible.map(p => p.playerId))
})

test('missing self never fabricates the current player or changes total', () => {
  const players = Array.from({ length: 12 }, (_, index) => ({
    playerId: 'peer-' + index,
    characterName: 'Explorer ' + index,
    x: 0,
    y: index,
  }))
  const { visible, hiddenCount } = selectWorldPresence(players, 'unavailable-self')
  expect(visible).toHaveLength(MAX_VISIBLE_WORLD_PLAYERS)
  expect(visible.every(player => players.includes(player))).toBe(true)
  expect(hiddenCount).toBe(4)
})
