import { expect, test } from '@playwright/test'
import { rankWorldPortalActions } from '../src/game/WorldPortalActions'

const self = { x: 4.5, y: 4.5 }
const marker = (id: string, x: number, y = 4.5) =>
  ({ id, contentKey: 'portal.grove', x, y })

test('portal action panel keeps reachable grant before forty distant grants without changing numbers', () => {
  const portals = [
    ...Array.from({ length: 40 }, (_, index) => marker('far-' + String(index).padStart(2, '0'), 30 + index)),
    marker('nearby', 5),
  ]
  const sorted = rankWorldPortalActions(self, portals)
  expect(sorted).toHaveLength(portals.length)
  expect(sorted[0]).toEqual({ portal: portals[40], number: 41 })
  expect(sorted.at(-1)?.portal.id).toBe('far-39')
  for (const item of sorted) expect(portals[item.number - 1]).toBe(item.portal)
  expect(new Set(sorted.map(item => item.portal.id)).size).toBe(portals.length)
})

test('equidistant portals tie-break by canonical id while retaining their original labels', () => {
  const portals = [marker('zeta', 6.5), marker('alpha', 2.5), marker('beta', 4.5, 6.5)]
  const result = rankWorldPortalActions(self, portals)
  expect(result.map(item => item.portal.id)).toEqual(['alpha', 'beta', 'zeta'])
  expect(result.map(item => item.number)).toEqual([2, 3, 1])
  expect(rankWorldPortalActions(self, [...portals].reverse()).map(item => item.portal.id))
    .toEqual(['alpha', 'beta', 'zeta'])
})

test('invalid marker positions do not hide valid nearby grants', () => {
  const portals = [marker('invalid-nan', NaN), marker('outside', 18.5), marker('nearby', 5),
    marker('invalid-infinite', Infinity)]
  const result = rankWorldPortalActions(self, portals)
  expect(result.map(x => x.portal.id)).toEqual([
    'nearby', 'outside', 'invalid-infinite', 'invalid-nan',
  ])
  expect(result.map(x => x.number)).toEqual([3, 2, 4, 1])
})

test('missing or invalid self leaves all granted actions in canonical API order', () => {
  const portals = [marker('far', 20), marker('near', 5), marker('another', 10)]
  expect(rankWorldPortalActions(undefined, portals).map(x => x.portal)).toEqual(portals)
  expect(rankWorldPortalActions({ x: NaN, y: 0 }, portals).map(x => x.portal)).toEqual(portals)
  expect(rankWorldPortalActions(self, [])).toEqual([])
})
