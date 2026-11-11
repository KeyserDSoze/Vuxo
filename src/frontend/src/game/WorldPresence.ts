import type { WorldPlayerSnapshot } from '../features/world/worldRealtime'

export const MAX_VISIBLE_WORLD_PLAYERS = 8

/**
 * Pure presentation policy. The multiplayer store, radar, Phaser world and
 * player count continue to use the complete server-owned snapshot.
 * When crowded, keep the current player visible and prioritize nearby peers.
 */
export function selectWorldPresence<T extends Pick<WorldPlayerSnapshot,
  'playerId' | 'characterName' | 'x' | 'y'>>(
  players: readonly T[],
  selfPlayerId: string | null,
): { visible: T[]; hiddenCount: number } {
  if (players.length <= MAX_VISIBLE_WORLD_PLAYERS) {
    return { visible: [...players], hiddenCount: 0 }
  }

  const self = selfPlayerId ? players.find(player => player.playerId === selfPlayerId) : undefined
  const distance = (player: T): number => {
    if (!self || ![self.x, self.y, player.x, player.y].every(Number.isFinite)) {
      return Number.POSITIVE_INFINITY
    }
    return Math.hypot(player.x - self.x, player.y - self.y)
  }

  const peers = players.filter(player => player.playerId !== self?.playerId)
  peers.sort((a, b) => distance(a) - distance(b)
    || a.characterName.localeCompare(b.characterName)
    || a.playerId.localeCompare(b.playerId))

  const visible = [...(self ? [self] : []),
    ...peers.slice(0, MAX_VISIBLE_WORLD_PLAYERS - (self ? 1 : 0))]
  return { visible, hiddenCount: players.length - visible.length }
}
