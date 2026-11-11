import { expect, test } from '@playwright/test'
import { MAX_RADAR_PEERS, projectRadarPoint, selectRadarPeers } from '../src/game/WorldRadar'

const self = { playerId: 'self', x: 0, y: 0 }

test('crowded radar keeps the closest 24 rather than alphabetical or arrival-first peers', () => {
  // All 31 candidates are inside the 12-tile radius. Present the farthest
  // first: the old .slice(0, 24) silently hid seven closer players.
  const peers = Array.from({ length: 31 }, (_, i) => ({
    playerId: 'peer-' + String(i).padStart(2, '0'),
    x: (i + 1) / 3,
    y: 0,
  })).reverse()
  const result = selectRadarPeers(self, peers)
  expect(result).toHaveLength(MAX_RADAR_PEERS)
  expect(result.map(entry => entry.player.playerId)).toEqual(
    Array.from({ length: MAX_RADAR_PEERS }, (_, i) => 'peer-' + String(i).padStart(2, '0')))
  expect(result.every(entry => entry.point.distance <= 8)).toBe(true)
  expect(selectRadarPeers(self, [...peers].reverse()).map(item => item.player.playerId))
    .toEqual(result.map(item => item.player.playerId))
})

test('equal-distance peers use canonical id tie-break independent of client ordering', () => {
  const peers = [
    { playerId: 'zeta', x: -3, y: -4 },
    { playerId: 'alpha', x: 3, y: 4 },
    { playerId: 'beta', x: 0, y: -5 },
  ]
  for (const order of [peers, [...peers].reverse(), [peers[1], peers[2], peers[0]]]) {
    expect(selectRadarPeers(self, order).map(item => item.player.playerId))
      .toEqual(['alpha', 'beta', 'zeta'])
  }
})

test('radar excludes self, invalid coordinates and off-range peers without inventing markers', () => {
  const peers = [
    self,
    { playerId: 'invalid-nan', x: NaN, y: 1 },
    { playerId: 'invalid-infinity', x: 2, y: Infinity },
    { playerId: 'outside', x: 12.01, y: 0 },
    { playerId: 'at-boundary', x: 12, y: 0 },
    { playerId: 'inside-negative', x: -2, y: -3 },
  ]
  const result = selectRadarPeers(self, peers)
  expect(result.map(entry => entry.player.playerId)).toEqual(['inside-negative', 'at-boundary'])
  expect(result[1].point.atEdge).toBe(false)
  expect(projectRadarPoint(self, { x: -2, y: -3 })).not.toBeNull()
  expect(projectRadarPoint(self, { x: Infinity, y: 0 })).toBeNull()
  expect(selectRadarPeers({ playerId: 'bad', x: NaN, y: 0 }, peers)).toEqual([])
  expect(selectRadarPeers(self, [])).toEqual([])
})
