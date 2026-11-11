import { Fullscreen, FullscreenExit, KeyboardArrowDown, KeyboardArrowLeft, KeyboardArrowRight, KeyboardArrowUp } from '@mui/icons-material'
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Phaser from 'phaser'
import { Link as RouterLink } from 'react-router-dom'
import './game.css'
import { createWorldRealtimeClient } from '../features/world/createWorldRealtimeClient'
import type {
  WorldConnectionStatus,
  WorldPlayerSnapshot,
  WorldRealtimeClient,
} from '../features/world/worldRealtime'
import { WorldScene } from './WorldScene'
import { PortalCompass } from './PortalCompass'
import { WorldRadar } from './WorldRadar'
import { selectWorldPresence } from './WorldPresence'
import { readStoredSession } from '../features/auth/authSession'
import { enterWorldPortal, fetchWorldPortals, PortalApiError, type WorldPortalMarker } from '../features/portals/portalApi'
import { PortalChallengesPage } from '../pages/PortalChallengesPage'
import { GuardianDuel } from '../features/portals/GuardianDuel'

export function GameCanvas() {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Keep an immediate guard as well as accessible disabled button state.
  // Blur and visibilitychange can arrive before React re-renders the HUD.
  const [windowInputActive, setWindowInputActive] = useState(() => !document.hidden)
  const windowInputActiveRef = useRef(!document.hidden)
  const [fullscreenError, setFullscreenError] = useState(false)
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
    }, count => {
      // The Playwright-only readiness signal is emitted after Phaser installs
      // the portal hit areas, not merely after the API returns portal data.
      if (import.meta.env.VITE_E2E_REALTIME === 'true') {
        host.current?.setAttribute('data-rendered-portals', String(count))
      }
    }, position => {
      if (import.meta.env.VITE_E2E_REALTIME !== 'true' || !host.current) return
      if (position) {
        host.current.dataset.portalScreenX = String(position.x)
        host.current.dataset.portalScreenY = String(position.y)
      } else {
        delete host.current.dataset.portalScreenX
        delete host.current.dataset.portalScreenY
      }
    })
    worldScene.current = scene

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: Math.max(1, host.current.clientWidth),
      height: Math.max(1, host.current.clientHeight),
      backgroundColor: '#172554',
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scene: [scene],
      scale: {
        // RESIZE changes the camera's visible world area instead of letterboxing
        // a fixed 16:9 image on ultrawide, portrait, or fullscreen displays.
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
    })

    // Fullscreen changes the parent element, not necessarily window.innerWidth.
    // ResizeObserver also handles panel, orientation, and browser F11 changes.
    const resizeWorld = () => {
      const width = Math.floor(host.current?.clientWidth ?? 0)
      const height = Math.floor(host.current?.clientHeight ?? 0)
      if (width < 1 || height < 1) return
      game.scale.resize(width, height)
      // The Phaser ScenePlugin is assigned only during engine boot. React's
      // layout effect can run earlier, so ignore camera updates until ready.
      if (scene.scene?.isActive()) scene.resizeViewport(width, height)
    }
    const observer = new ResizeObserver(resizeWorld)
    observer.observe(host.current)
    resizeWorld()

    // Losing browser focus (including a background tab) can lose keyup and
    // pointerup. Freeze the local controller and send a neutral server intent.
    const suspendMovement = () => {
      windowInputActiveRef.current = false
      setWindowInputActive(false)
      // Stops both keyboard and touch intentions through the same neutral
      // intent; no stale touch press is replayed after focus returns.
      scene.setWindowInputActive(false)
    }
    const resumeMovement = () => {
      if (document.hidden) return
      windowInputActiveRef.current = true
      setWindowInputActive(true)
      scene.setWindowInputActive(true)
    }
    const onVisibilityChange = () => {
      if (document.hidden) suspendMovement()
      else resumeMovement()
    }
    window.addEventListener('blur', suspendMovement)
    window.addEventListener('focus', resumeMovement)
    document.addEventListener('visibilitychange', onVisibilityChange)

    void client.connect()

    return () => {
      window.removeEventListener('blur', suspendMovement)
      window.removeEventListener('focus', resumeMovement)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()
      unsubscribe()
      realtime.current = null
      worldScene.current = null
      game.destroy(true)
      void client.disconnect()
    }
  }, [])

  const toggleFullscreen = async () => {
    if (!screen.current) return
    try {
      if (document.fullscreenElement === screen.current) {
        await document.exitFullscreen()
      } else {
        await screen.current.requestFullscreen()
      }
      setFullscreenError(false)
    } catch {
      // Browser policy or embedded contexts can reject fullscreen.
      setFullscreenError(true)
    }
  }

  useEffect(() => {
    const synchronizeFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === screen.current)
      setFullscreenError(false)
    }
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (event.code !== 'KeyF' || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      void toggleFullscreen()
    }
    document.addEventListener('fullscreenchange', synchronizeFullscreen)
    document.addEventListener('keydown', onShortcut)
    return () => {
      document.removeEventListener('fullscreenchange', synchronizeFullscreen)
      document.removeEventListener('keydown', onShortcut)
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
  const presence = selectWorldPresence(players, selfPlayerId)
  // Client proximity is ONLY an affordance. The API always checks server state.
  const nearby = (portal: WorldPortalMarker) => Boolean(self)
    && Math.hypot(self!.x - portal.x, self!.y - portal.y) <= 1.5

  const touchLocked = status !== 'connected' || activePortal !== null || !windowInputActive
  const touch = (horizontal: number, vertical: number) => {
    // Unlike Phaser's keyboard update, pointer handlers bypass WorldScene.
    // Enforce the same modal/focus/connection lock at the input boundary.
    if (touchLocked || !windowInputActiveRef.current || document.hidden ||
        realtime.current?.getState().status !== 'connected') return
    realtime.current.setMovementIntent(horizontal, vertical)
  }

  const stopTouch = () => realtime.current?.setMovementIntent(0, 0)

  return (
    <Box ref={screen} className="vuxo-game-shell" data-testid="game-shell">
      <Box className="game-canvas vuxo-game-world" ref={host} data-testid="game-canvas" />
      <Box className="vuxo-game-vignette" aria-hidden="true" />

      <Stack className="vuxo-game-hud vuxo-game-hud--left" spacing={0.5}>
        <Typography component="p" className="vuxo-game-eyebrow">{t('game.screen.chapter')}</Typography>
        <Typography component="h1" variant="h6" className="vuxo-game-title">{t('game.title')}</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            data-testid="world-connection-status"
            data-status={status}
            size="small"
            color={status === 'connected' ? 'success' : status === 'error' ? 'error' : 'default'}
            label={t(`game.connection.${status}`)}
          />
          <Typography variant="caption" sx={{ color: 'var(--vuxo-game-hud-text)' }}>
            {t('game.playersOnline', { count: players.length })}
          </Typography>
        </Stack>
        <Stack data-testid="world-presence" direction="row" spacing={0.5} className="vuxo-game-presence">
          {presence.visible.map(player => (
            <Chip
              key={player.playerId}
              size="small"
              variant="outlined"
              label={player.characterName}
              data-player-id={player.playerId}
              data-player-x={player.x}
              data-player-y={player.y}
              data-player-revision={player.revision}
              data-player-appearance-revision={player.appearanceRevision ?? 0}
              data-player-hair-color={player.appearance?.hairColor ?? ''}
              sx={{ color: 'var(--vuxo-game-hud-text)', borderColor: 'var(--vuxo-game-hud-border)' }}
            />
          ))}
          {presence.hiddenCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              data-testid="world-presence-overflow"
              label={'+' + presence.hiddenCount}
              aria-label={t('game.playersHidden', { count: presence.hiddenCount })}
              title={t('game.playersOnline', { count: players.length })}
              sx={{ color: 'var(--vuxo-game-hud-accent)', borderColor: 'var(--vuxo-game-hud-border)' }}
            />
          )}
        </Stack>
      </Stack>

      <WorldRadar status={status} self={self} players={players} portals={portals} />

      <Stack className="vuxo-game-actions" direction="row" spacing={1}>
        <Button component={RouterLink} to="/refuge" color="inherit" variant="outlined" size="small" className="vuxo-game-button" data-testid="game-refuge-link">
          {t('game.screen.refuge')}
        </Button>
        <Button
          data-testid="game-fullscreen-toggle"
          aria-label={t(isFullscreen ? 'game.screen.exitFullscreen' : 'game.screen.fullscreen')}
          title={t('game.screen.fullscreenHint')}
          onClick={() => void toggleFullscreen()}
          startIcon={isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          color="inherit"
          variant="outlined"
          size="small"
          className="vuxo-game-button"
        >
          {t(isFullscreen ? 'game.screen.exitFullscreen' : 'game.screen.fullscreen')}
        </Button>
      </Stack>

      {(fullscreenError || portalErrorCode || errorCode) && (
        <Stack className="vuxo-game-notices" spacing={0.75}>
          {fullscreenError && (
            <Alert data-testid="game-fullscreen-error" severity="warning">
              {t('game.screen.fullscreenUnavailable')}
            </Alert>
          )}
          {portalErrorCode && (
            <Alert data-testid="world-portal-error" severity="warning">
              {t(`portals.errors.${portalErrorCode}`, { defaultValue: t('game.portal.genericError') })}
            </Alert>
          )}
          {errorCode && (
            <Alert data-testid="world-error" severity="error">
              {t(`errors.${errorCode}`, { defaultValue: t('game.connection.genericError') })}
            </Alert>
          )}
        </Stack>
      )}

      {portals.length > 0 && (
        <Box className="vuxo-game-portals" data-testid="world-portals">
          <Typography variant="caption" sx={{ color: 'var(--vuxo-game-hud-text)', fontWeight: 700 }}>
            {t('game.portal.available', { count: portals.length })}
          </Typography>
          {status === 'connected' && <PortalCompass self={self} portals={portals} />}
          <Stack direction="row" spacing={0.75} className="vuxo-game-portal-actions">
            {portals.map((portal, index) => (
              <Button
                key={portal.id}
                data-testid="world-portal-enter"
                data-grant-id={portal.id}
                variant="outlined"
                size="small"
                className="vuxo-game-button"
                disabled={status !== 'connected' || !nearby(portal) || Boolean(activePortal)}
                onClick={() => void enter(portal.id)}
              >
                {t('game.portal.enter', { number: index + 1 })}
              </Button>
            ))}
          </Stack>
          {portals.some(portal => !nearby(portal)) && (
            <Typography variant="caption" sx={{ color: 'var(--vuxo-game-hud-text)', opacity: 0.8 }}>
              {t('game.portal.moveCloser')}
            </Typography>
          )}
        </Box>
      )}

      <Box data-testid="touch-controls" className="vuxo-game-touch-controls">
        <IconButton
          aria-label={t('game.controls.up')}
          data-testid="touch-up"
          disabled={touchLocked}
          onPointerDown={() => touch(0, -1)}
          onPointerUp={stopTouch}
          onPointerCancel={stopTouch}
          onPointerLeave={stopTouch}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 2, gridRow: 1 }}
        >
          <KeyboardArrowUp />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.left')}
          data-testid="touch-left"
          disabled={touchLocked}
          onPointerDown={() => touch(-1, 0)}
          onPointerUp={stopTouch}
          onPointerCancel={stopTouch}
          onPointerLeave={stopTouch}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 1, gridRow: 2 }}
        >
          <KeyboardArrowLeft />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.down')}
          data-testid="touch-down"
          disabled={touchLocked}
          onPointerDown={() => touch(0, 1)}
          onPointerUp={stopTouch}
          onPointerCancel={stopTouch}
          onPointerLeave={stopTouch}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 2, gridRow: 2 }}
        >
          <KeyboardArrowDown />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.right')}
          data-testid="touch-right"
          disabled={touchLocked}
          onPointerDown={() => touch(1, 0)}
          onPointerUp={stopTouch}
          onPointerCancel={stopTouch}
          onPointerLeave={stopTouch}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 3, gridRow: 2 }}
        >
          <KeyboardArrowRight />
        </IconButton>
      </Box>
      <Dialog
        container={() => screen.current}
        open={activePortal !== null}
        onClose={() => setActivePortal(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="world-portal-dialog-title"
        data-testid="world-portal-dialog"
      >
        <DialogTitle id="world-portal-dialog-title">{t('game.portal.challenge')}</DialogTitle>
        <DialogContent>
          {activePortal && <GuardianDuel grantId={activePortal.id} />}
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
    </Box>
  )
}
