import { MapOutlined } from '@mui/icons-material'
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorldPlayerSnapshot, WorldConnectionStatus } from '../features/world/worldRealtime'
import type { WorldPortalMarker } from '../features/portals/portalApi'

// This is a local *display* of server-owned snapshot coordinates, not a world
// authority, navigation endpoint, hit area or alternative portal-entry path.
const RANGE_TILES = 12
const CENTER = 72
const DRAW_RADIUS = 50
export const MAX_RADAR_PEERS = 24
export const MAX_RADAR_PORTALS = 24

type WorldPoint = { x: number; y: number }
export type RadarProjection = {
  x: number
  y: number
  distance: number
  atEdge: boolean
}

export function projectRadarPoint(
  self: WorldPoint,
  point: WorldPoint,
): RadarProjection | null {
  if (![self.x, self.y, point.x, point.y].every(Number.isFinite)) return null
  const dx = point.x - self.x
  const dy = point.y - self.y // Phaser world Y increases down/south.
  const distance = Math.hypot(dx, dy)
  if (!Number.isFinite(distance)) return null
  const scale = DRAW_RADIUS / Math.max(RANGE_TILES, distance)
  return {
    x: CENTER + dx * scale,
    y: CENTER + dy * scale,
    distance,
    atEdge: distance > RANGE_TILES,
  }
}

type RadarPeer = WorldPoint & { playerId: string }

/**
 * The HUD does not own world state. When the server already exposed more
 * nearby peers than fit in the radar, display the nearest 24, not the first
 * 24 names in GameCanvas' alphabetical presence list. Tie-break by ID to
 * prevent peer-order changes from reshuffling equal-distance markers.
 */
export function selectRadarPeers<T extends RadarPeer>(
  self: RadarPeer,
  players: readonly T[],
): Array<{ player: T; point: RadarProjection }> {
  return players
    .filter(player => player.playerId !== self.playerId)
    .map(player => ({ player, point: projectRadarPoint(self, player) }))
    .filter((entry): entry is { player: T; point: RadarProjection } =>
      entry.point !== null && !entry.point.atEdge)
    .sort((a, b) => a.point.distance - b.point.distance
      || (a.player.playerId < b.player.playerId ? -1 : a.player.playerId > b.player.playerId ? 1 : 0))
    .slice(0, MAX_RADAR_PEERS)
}

/**
 * Prioritize the closest owner-granted portals when the API returns more than
 * the radar can display. The index (and thus the portal's number in the HUD)
 * remains the original API-list index, not its distance ranking.
 * No local data grants permission to enter a portal.
 */
export function selectRadarPortals<T extends WorldPoint & { id: string }>(
  self: WorldPoint,
  portals: readonly T[],
): Array<{ portal: T; number: number; point: RadarProjection }> {
  return portals
    .map((portal, index) => ({
      portal, number: index + 1, point: portal && projectRadarPoint(self, portal),
    }))
    .filter((entry): entry is { portal: T; number: number; point: RadarProjection } =>
      entry.point !== null && typeof entry.portal?.id === 'string' && entry.portal.id.length > 0)
    .sort((a, b) => a.point.distance - b.point.distance
      || (a.portal.id < b.portal.id ? -1 : a.portal.id > b.portal.id ? 1 : 0))
    .slice(0, MAX_RADAR_PORTALS)
}

export function WorldRadar({
  status, self, players, portals,
}: {
  status: WorldConnectionStatus
  self: WorldPlayerSnapshot | undefined
  players: readonly WorldPlayerSnapshot[]
  portals: readonly WorldPortalMarker[]
}) {
  const { t } = useTranslation()
  const compact = useMediaQuery('(max-width: 599px), (max-height: 560px)')
  const [expanded, setExpanded] = useState(false)
  const visible = !compact || expanded

  // Never render invented coordinates or markers from an absent session.
  if (status !== 'connected' || !self ||
      !Number.isFinite(self.x) || !Number.isFinite(self.y)) return null

  // Nearby players are already visible through the realtime world/presence.
  // Keep the radar bounded even in crowded scenes; do not invent remote peers.
  const peers = selectRadarPeers(self, players)

  // Only owner-granted API portals are eligible; when >24 exist, prefer near
  // markers to distant edge markers and preserve each API-list number.
  const grants = selectRadarPortals(self, portals)

  return (
    <Box
      data-testid="world-radar"
      data-expanded={String(visible)}
      className={'vuxo-game-radar' + (compact ? ' vuxo-game-radar--compact' : '')}
      role="region"
      aria-label={t('game.radar.title')}
    >
      <Box className="vuxo-game-radar-heading">
        <MapOutlined className="vuxo-game-radar-symbol" aria-hidden="true" fontSize="small" />
        <Typography component="span" variant="caption" className="vuxo-game-radar-heading-text">
          {t('game.radar.title')}
        </Typography>
        {compact ? (
          <IconButton
            data-testid="world-radar-toggle"
            className="vuxo-game-radar-toggle"
            size="small"
            onClick={() => setExpanded(previous => !previous)}
            aria-expanded={visible}
            aria-controls={visible ? 'world-radar-chart' : undefined}
            aria-label={t(visible ? 'game.radar.hide' : 'game.radar.show')}
          >
            {visible ? '−' : '+'}
          </IconButton>
        ) : (
          <Typography component="span" variant="caption" className="vuxo-game-radar-scale">
            {t('game.radar.range', { count: RANGE_TILES })}
          </Typography>
        )}
      </Box>
      {visible && (
        <svg
          id="world-radar-chart"
          data-testid="world-radar-chart"
          className="vuxo-game-radar-chart"
          viewBox="0 0 144 144"
          role="img"
          aria-label={t('game.radar.summary', {
            players: peers.length, portals: grants.length, range: RANGE_TILES,
          })}
        >
          <circle cx={CENTER} cy={CENTER} r="56" className="vuxo-game-radar-boundary" />
          <circle cx={CENTER} cy={CENTER} r="25" className="vuxo-game-radar-ring" />
          <circle cx={CENTER} cy={CENTER} r={DRAW_RADIUS} className="vuxo-game-radar-ring" />
          <path d="M72 13 V131 M13 72 H131" className="vuxo-game-radar-crosshair" />
          <text x="72" y="10" textAnchor="middle" className="vuxo-game-radar-north">N</text>
          {peers.map(({ player, point }) => (
            <circle
              key={player.playerId}
              data-testid="world-radar-peer"
              cx={point.x}
              cy={point.y}
              r="4.5"
              className="vuxo-game-radar-peer"
            >
              <title>{t('game.radar.peer', { name: player.characterName })}</title>
            </circle>
          ))}
          {grants.map(({ portal, number, point }) => (
            <rect
              key={portal.id}
              data-testid="world-radar-portal"
              data-number={number}
              data-at-edge={String(point.atEdge)}
              data-distance={point.distance}
              x={point.x - 3.5}
              y={point.y - 3.5}
              width="7"
              height="7"
              transform={`rotate(45 ${point.x} ${point.y})`}
              className={'vuxo-game-radar-portal' + (point.atEdge ? ' vuxo-game-radar-portal--edge' : '')}
            >
              <title>{t('game.radar.portal', { number })}</title>
            </rect>
          ))}
          <circle data-testid="world-radar-self" cx={CENTER} cy={CENTER} r="7" className="vuxo-game-radar-self" />
          <circle cx={CENTER} cy={CENTER} r="2" className="vuxo-game-radar-self-core" />
        </svg>
      )}
    </Box>
  )
}
