import { Box, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { WorldPortalMarker } from '../features/portals/portalApi'
import type { WorldPlayerSnapshot } from '../features/world/worldRealtime'

// Presentation only. The world state and the authenticated grants are the
// sole sources: this calculation never moves a player or authorizes entry.
const sectors = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
type Sector = typeof sectors[number]

type NearestPortal = {
  number: number
  distance: number
  direction: Sector
  degrees: number
}

export function nearestPortalBearing(
  self: Pick<WorldPlayerSnapshot, 'x' | 'y'> | undefined,
  portals: readonly WorldPortalMarker[],
): NearestPortal | null {
  if (!self || !Number.isFinite(self.x) || !Number.isFinite(self.y)) return null

  let result: (NearestPortal & { id: string }) | null = null
  for (const [index, portal] of portals.entries()) {
    if (!portal || typeof portal.id !== 'string' || !portal.id ||
        !Number.isFinite(portal.x) || !Number.isFinite(portal.y)) continue
    const dx = portal.x - self.x
    const dy = portal.y - self.y
    const distance = Math.hypot(dx, dy)
    if (!Number.isFinite(distance)) continue
    // Ties are settled by grant ID, not by the API list's arrival order.
    if (result && (distance > result.distance ||
        (distance === result.distance && portal.id >= result.id))) continue

    // Phaser's Y axis increases towards south; zero degrees means north.
    const degrees = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
    result = {
      id: portal.id,
      number: index + 1,
      distance,
      degrees,
      direction: sectors[Math.floor((degrees + 22.5) / 45) % sectors.length],
    }
  }
  if (!result) return null
  return {
    number: result.number,
    distance: result.distance,
    degrees: result.degrees,
    direction: result.direction,
  }
}

export function PortalCompass({
  self, portals,
}: {
  self: WorldPlayerSnapshot | undefined
  portals: readonly WorldPortalMarker[]
}) {
  const { t } = useTranslation()
  const bearing = nearestPortalBearing(self, portals)
  if (!bearing) return null

  const distance = t('game.portal.compass.distance', { count: Math.ceil(bearing.distance) })
  const direction = t('game.portal.compass.directions.' + bearing.direction)
  const inRange = bearing.distance <= 1.5
  const readout = inRange
    ? t('game.portal.compass.inRange', { distance })
    : t('game.portal.compass.readout', { direction, distance })

  return (
    <Stack
      data-testid="world-portal-compass"
      data-target-number={bearing.number}
      data-direction={bearing.direction}
      data-distance={bearing.distance}
      direction="row"
      alignItems="center"
      spacing={1}
      className="vuxo-game-portal-compass"
      role="group"
      aria-label={t('game.portal.compass.accessible', {
        number: bearing.number, direction: inRange ? t('game.portal.compass.nearby') : direction, distance,
      })}
    >
      <Box className="vuxo-game-compass-dial" aria-hidden="true">
        <Box className="vuxo-game-compass-needle" sx={{ transform: 'rotate(' + bearing.degrees + 'deg)' }}>
          ▲
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" className="vuxo-game-compass-title" variant="caption" display="block">
          {t('game.portal.compass.target', { number: bearing.number })}
        </Typography>
        <Typography component="span" className="vuxo-game-compass-readout" variant="caption" display="block">
          {readout}
        </Typography>
      </Box>
    </Stack>
  )
}
