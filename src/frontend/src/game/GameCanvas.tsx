import { KeyboardArrowDown, KeyboardArrowLeft, KeyboardArrowRight, KeyboardArrowUp } from '@mui/icons-material'
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Phaser from 'phaser'
import { createWorldRealtimeClient } from '../features/world/createWorldRealtimeClient'
import type {
  WorldConnectionStatus,
  WorldPlayerSnapshot,
  WorldRealtimeClient,
} from '../features/world/worldRealtime'
import { WorldScene } from './WorldScene'
import { readStoredSession } from '../features/auth/authSession'
import { enterWorldPortal, fetchWorldPortals, PortalApiError, type WorldPortalMarker } from '../features/portals/portalApi'
import { PortalChallengesPage } from '../pages/PortalChallengesPage'

export function GameCanvas() {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const realtime = useRef<WorldRealtimeClient | null>(null)
  const worldScene = useRef<WorldScene | null>(null)
  const [status, setStatus] = useState<WorldConnectionStatus>('idle')
  const [players, setPlayers] = useState<WorldPlayerSnapshot[]>([])
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null)
  const [portals, setPortals] = useState<WorldPortalMarker[]>([])
  const [portalErrorCode, setPortalErrorCode] = useState<string | null>(null)
  const [activePortal, setActivePortal] = useState<WorldPortalMarker | null>(null)

  useEffect(() => {
    if (!host.current) return

    const client = createWorldRealtimeClient()
    realtime.current = client
    const unsubscribe = client.subscribe(state => {
      setStatus(state.status)
      setPlayers([...state.players.values()].sort((a, b) => a.characterName.localeCompare(b.characterName)))
      setErrorCode(state.errorCode)
      setSelfPlayerId(state.selfPlayerId)
    })

    const scene = new WorldScene(client, grantId => {
      client.setMovementIntent(0, 0)
      void enterWorldPortal(grantId)
        .then(marker => {
          setPortalErrorCode(null)
          setActivePortal(marker)
        })
        .catch(error => {
          setPortalErrorCode(error instanceof PortalApiError
            ? error.code : 'portal_request_failed')
        })
    })
    worldScene.current = scene

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 960,
      height: 540,
      backgroundColor: '#172554',
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scene: [scene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    })

    void client.connect()

    return () => {
      unsubscribe()
      realtime.current = null
      worldScene.current = null
      game.destroy(true)
      void client.disconnect()
    }
  }, [])

  useEffect(() => {
    if (status !== 'connected' || !readStoredSession()) {
      setPortals([])
      return
    }

    const controller = new AbortController()
    const reload = async () => {
      try {
        const markers = await fetchWorldPortals(controller.signal)
        if (!controller.signal.aborted) setPortals(markers)
      } catch (error) {
        if (!controller.signal.aborted) {
          setPortalErrorCode(error instanceof PortalApiError
            ? error.code : 'portal_request_failed')
        }
      }
    }
    void reload()
    // Refresh privately granted and consumed portals while remaining in-world.
    const interval = window.setInterval(() => void reload(), 15_000)
    return () => {
      window.clearInterval(interval)
      controller.abort()
    }
  }, [status])

  useEffect(() => {
    worldScene.current?.setPortals(portals)
  }, [portals])

  useEffect(() => {
    worldScene.current?.setInputLocked(activePortal !== null)
    if (activePortal) realtime.current?.setMovementIntent(0, 0)
  }, [activePortal])

  const enter = async (grantId: string) => {
    realtime.current?.setMovementIntent(0, 0)
    setPortalErrorCode(null)
    try {
      const marker = await enterWorldPortal(grantId)
      setActivePortal(marker)
    } catch (error) {
      setPortalErrorCode(error instanceof PortalApiError ? error.code : 'portal_request_failed')
    }
  }

  const self = players.find(player => player.playerId === selfPlayerId)
  // Client proximity is ONLY an affordance. The API always checks server state.
  const nearby = (portal: WorldPortalMarker) => Boolean(self)
    && Math.hypot(self!.x - portal.x, self!.y - portal.y) <= 1.5

  const touch = (horizontal: number, vertical: number) => {
    realtime.current?.setMovementIntent(horizontal, vertical)
  }

  const stopTouch = () => realtime.current?.setMovementIntent(0, 0)

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            data-testid="world-connection-status"
            data-status={status}
            size="small"
            color={status === 'connected' ? 'success' : status === 'error' ? 'error' : 'default'}
            label={t(`game.connection.${status}`)}
          />
          <Typography variant="body2" color="text.secondary">
            {t('game.playersOnline', { count: players.length })}
          </Typography>
          {self && (
            <Chip
              size="small"
              variant="outlined"
              data-testid="world-speed"
              data-speed={self.speedMultiplier}
              label={t('game.effectiveSpeed', { multiplier: self.speedMultiplier.toFixed(2) })}
            />
          )}
        </Stack>
        <Stack data-testid="world-presence" direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
          {players.map(player => (
            <Chip
              key={player.playerId}
              size="small"
              variant="outlined"
              label={player.characterName}
              data-player-id={player.playerId}
              data-player-x={player.x}
              data-player-y={player.y}
              data-player-revision={player.revision}
              data-player-speed={player.speedMultiplier}
            />
          ))}
        </Stack>
      </Stack>

      {portalErrorCode && (
        <Alert data-testid="world-portal-error" severity="warning">
          {t(`portals.errors.${portalErrorCode}`, { defaultValue: t('game.portal.genericError') })}
        </Alert>
      )}

      {portals.length > 0 && (
        <Stack spacing={1} data-testid="world-portals">
          <Typography variant="body2" color="text.secondary">
            {t('game.portal.available', { count: portals.length })}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
            {portals.map((portal, index) => (
              <Button
                key={portal.id}
                data-testid="world-portal-enter"
                data-grant-id={portal.id}
                variant="outlined"
                disabled={status !== 'connected' || !nearby(portal) || Boolean(activePortal)}
                onClick={() => void enter(portal.id)}
              >
                {t('game.portal.enter', { number: index + 1 })}
              </Button>
            ))}
          </Stack>
          {portals.some(portal => !nearby(portal)) && (
            <Typography variant="caption" color="text.secondary">{t('game.portal.moveCloser')}</Typography>
          )}
        </Stack>
      )}

      {errorCode && (
        <Typography data-testid="world-error" variant="caption" color="error.main">
          {t(`errors.${errorCode}`, { defaultValue: t('game.connection.genericError') })}
        </Typography>
      )}

      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', minHeight: 240 }}>
        <Box className="game-canvas" ref={host} data-testid="game-canvas" sx={{ position: 'absolute', inset: 0 }} />

        <Box
          data-testid="touch-controls"
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            display: { xs: 'grid', md: 'none' },
            gridTemplateColumns: 'repeat(3, 44px)',
            gridTemplateRows: 'repeat(2, 44px)',
            gap: 0.5,
            zIndex: 20,
            touchAction: 'none',
          }}
        >
          <IconButton
            aria-label={t('game.controls.up')}
            data-testid="touch-up"
            onPointerDown={() => touch(0, -1)}
            onPointerUp={stopTouch}
            onPointerCancel={stopTouch}
            sx={{ gridColumn: 2, gridRow: 1, bgcolor: 'background.paper', opacity: 0.85 }}
          >
            <KeyboardArrowUp />
          </IconButton>
          <IconButton
            aria-label={t('game.controls.left')}
            data-testid="touch-left"
            onPointerDown={() => touch(-1, 0)}
            onPointerUp={stopTouch}
            onPointerCancel={stopTouch}
            sx={{ gridColumn: 1, gridRow: 2, bgcolor: 'background.paper', opacity: 0.85 }}
          >
            <KeyboardArrowLeft />
          </IconButton>
          <IconButton
            aria-label={t('game.controls.down')}
            data-testid="touch-down"
            onPointerDown={() => touch(0, 1)}
            onPointerUp={stopTouch}
            onPointerCancel={stopTouch}
            sx={{ gridColumn: 2, gridRow: 2, bgcolor: 'background.paper', opacity: 0.85 }}
          >
            <KeyboardArrowDown />
          </IconButton>
          <IconButton
            aria-label={t('game.controls.right')}
            data-testid="touch-right"
            onPointerDown={() => touch(1, 0)}
            onPointerUp={stopTouch}
            onPointerCancel={stopTouch}
            sx={{ gridColumn: 3, gridRow: 2, bgcolor: 'background.paper', opacity: 0.85 }}
          >
            <KeyboardArrowRight />
          </IconButton>
        </Box>
      </Box>
      <Dialog
        open={activePortal !== null}
        onClose={() => setActivePortal(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="world-portal-dialog-title"
        data-testid="world-portal-dialog"
      >
        <DialogTitle id="world-portal-dialog-title">{t('game.portal.challenge')}</DialogTitle>
        <DialogContent>
          {activePortal && (
            <PortalChallengesPage
              key={activePortal.id}
              initialGrantId={activePortal.id}
              onCompleted={grantId => {
                setPortals(markers => markers.filter(portal => portal.id !== grantId))
              }}
              onExit={() => setActivePortal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  )
}
