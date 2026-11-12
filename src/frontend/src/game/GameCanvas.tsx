import { ExpandLess, ExpandMore, Fullscreen, FullscreenExit, HelpOutlined, KeyboardArrowDown, KeyboardArrowLeft, KeyboardArrowRight, KeyboardArrowUp } from '@mui/icons-material'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material'
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
import { isUnmodifiedWorldShortcut } from './WorldInputFocus'
import { HeldWorldTouchDirections } from './WorldTouchInput'
import { PortalCompass } from './PortalCompass'
import { WorldRadar } from './WorldRadar'
import { previewWorldPortalActions, rankWorldPortalActions } from './WorldPortalActions'
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
  const [hudExpanded, setHudExpanded] = useState(true)
  const [controlsOpen, setControlsOpen] = useState(false)
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
  // Only the confirmed completion callback can add an ID to this short-lived
  // UI reconciliation set. Server-issued grants/positions remain authoritative;
  // a GET that started before completion cannot resurrect a spent marker.
  const completedPortalIds = useRef(new Set<string>())
  const portalRefreshRevision = useRef(0)
  // A successful GET must clear only a transient list error, never an
  // independent failed portal-entry POST that still needs player attention.
  const [portalListErrorCode, setPortalListErrorCode] = useState<string | null>(null)
  const [portalEntryErrorCode, setPortalEntryErrorCode] = useState<string | null>(null)
  const portalErrorCode = portalEntryErrorCode ?? portalListErrorCode
  const [activePortal, setActivePortal] = useState<WorldPortalMarker | null>(null)
  const [portalEntering, setPortalEntering] = useState(false)
  // One synchronous in-flight guard for both Phaser hit areas and HUD buttons.
  // Ref is checked before the next React paint, so rapid clicks cannot race.
  const portalEntryInFlight = useRef(false)
  const enterPortalFromScene = useRef<(grantId: string) => void>(() => {})
  const [allPortalActionsVisible, setAllPortalActionsVisible] = useState(false)
  const heldTouchDirections = useRef(new HeldWorldTouchDirections())

  // Clear *pointer ownership*, not just the last network intent. Otherwise
  // releasing a stale finger after blur/portal dismissal can revive movement.
  const clearTouch = () => {
    heldTouchDirections.current.clear()
    realtime.current?.setMovementIntent(0, 0)
  }

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

    // The ref is replaced on every React render so Phaser cannot retain
    // a stale callback. Both UI surfaces share one request and one lock.
    const scene = new WorldScene(client, grantId => {
      enterPortalFromScene.current(grantId)
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
      clearTouch()
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
      heldTouchDirections.current.clear()
      completedPortalIds.current.clear()
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
      // The same interactive-focus boundary protects Phaser movement.
      // The focused control keeps its native text/keyboard behavior.
      if ((event.code !== 'KeyF' && event.code !== 'KeyH') ||
          !isUnmodifiedWorldShortcut(event)) return
      event.preventDefault()
      if (event.code === 'KeyH') setHudExpanded(expanded => !expanded)
      else void toggleFullscreen()
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
      completedPortalIds.current.clear()
      setPortals([])
      setPortalListErrorCode(null)
      return
    }

    const controller = new AbortController()
    let nextRefresh: number | null = null
    const reload = async () => {
      try {
        const markers = await fetchWorldPortals(controller.signal)
        if (!controller.signal.aborted) {
          const completed = completedPortalIds.current
          const freshIds = new Set(markers.map(marker => marker.id))
          // Once the API stops reporting a completed grant, the stale
          // response hazard is gone. Do not retain tombstones indefinitely.
          for (const id of completed) if (!freshIds.has(id)) completed.delete(id)
          setPortals(markers.filter(marker => !completed.has(marker.id)))
          setPortalListErrorCode(null)
          if (import.meta.env.VITE_E2E_REALTIME === 'true') {
            host.current?.setAttribute('data-e2e-portal-list-refresh-revision',
              String(++portalRefreshRevision.current))
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPortalListErrorCode(error instanceof PortalApiError
            ? error.code : 'portal_request_failed')
        }
      } finally {
        // Schedule only after the request settles: slow private API GETs
        // must never overlap and apply stale marker snapshots out of order.
        // Abort on unmount/reconnect also stops the retry cycle.
        if (!controller.signal.aborted) {
          nextRefresh = window.setTimeout(() => void reload(), 15_000)
        }
      }
    }
    void reload()
    return () => {
      if (nextRefresh !== null) window.clearTimeout(nextRefresh)
      controller.abort()
    }
  }, [status])

  useEffect(() => {
    worldScene.current?.setPortals(portals)
  }, [portals])

  useEffect(() => {
    worldScene.current?.setInputLocked(activePortal !== null || portalEntering || controlsOpen)
    if (activePortal || portalEntering || controlsOpen) realtime.current?.setMovementIntent(0, 0)
  }, [activePortal, portalEntering, controlsOpen])

  const enter = async (grantId: string) => {
    // The server is authoritative about proximity and the grant. Client-side
    // gating only prevents accidental duplicate POSTs while one is pending.
    if (portalEntryInFlight.current || activePortal || controlsOpen ||
        realtime.current?.getState().status !== 'connected') return
    portalEntryInFlight.current = true
    clearTouch()
    setPortalEntering(true)
    worldScene.current?.setInputLocked(true)
    realtime.current?.setMovementIntent(0, 0)
    setPortalEntryErrorCode(null)
    try {
      const marker = await enterWorldPortal(grantId)
      setActivePortal(marker)
    } catch (error) {
      setPortalEntryErrorCode(error instanceof PortalApiError ? error.code : 'portal_request_failed')
    } finally {
      portalEntryInFlight.current = false
      setPortalEntering(false)
    }
  }
  enterPortalFromScene.current = grantId => { void enter(grantId) }

  const self = players.find(player => player.playerId === selfPlayerId)
  const presence = selectWorldPresence(players, selfPlayerId)
  // HUD ordering is a display hint only; entry is still owner-authorized by API.
  const portalActions = rankWorldPortalActions(self, portals)
  const portalPreview = previewWorldPortalActions(portalActions, allPortalActionsVisible)
  // Client proximity is ONLY an affordance. The API always checks server state.
  const nearby = (portal: WorldPortalMarker) => Boolean(self)
    && Math.hypot(self!.x - portal.x, self!.y - portal.y) <= 1.5

  const touchLocked = status !== 'connected' || activePortal !== null ||
    portalEntering || controlsOpen || !windowInputActive
  // A reconnect or modal can disable the buttons without emitting pointerup.
  // Never restore those held directions when gameplay becomes active again.
  useEffect(() => {
    if (touchLocked) clearTouch()
  }, [touchLocked])

  const canSendTouch = () => !touchLocked && !portalEntryInFlight.current &&
    windowInputActiveRef.current && !document.hidden &&
    realtime.current?.getState().status === 'connected'

  const pressTouch = (pointerId: number, horizontal: number, vertical: number) => {
    if (!canSendTouch()) return
    const intent = heldTouchDirections.current.press(pointerId, horizontal, vertical)
    if (intent) realtime.current?.setMovementIntent(intent.horizontal, intent.vertical)
  }

  const releaseTouch = (pointerId: number) => {
    const intent = heldTouchDirections.current.release(pointerId)
    if (!intent) return
    if (!canSendTouch()) {
      clearTouch()
      return
    }
    realtime.current?.setMovementIntent(intent.horizontal, intent.vertical)
  }

  const openControls = () => {
    if (activePortal || portalEntering) return
    // Flush any held finger/keyboard intention before the dialog receives focus.
    clearTouch()
    worldScene.current?.setInputLocked(true)
    setControlsOpen(true)
  }

  return (
    <Box ref={screen} className="vuxo-game-shell" data-testid="game-shell">
      <Box
        className="game-canvas vuxo-game-world"
        ref={host}
        data-testid="game-canvas"
        role="region"
        aria-label={t('game.title')}
        tabIndex={0}
        onPointerDown={event => {
          // Phaser's canvas is not natively focusable. Clicking back into
          // the world after HUD keyboard navigation must explicitly restore
          // keyboard focus, without scrolling the document.
          event.currentTarget.focus({ preventScroll: true })
        }}
      />
      <Box className="vuxo-game-vignette" aria-hidden="true" />

      <Stack className="vuxo-game-hud vuxo-game-hud--left" spacing={0.5}
        data-testid="world-hud" data-expanded={String(hudExpanded)}>
        <Stack direction="row" className="vuxo-game-hud-status"
          sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
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
          <IconButton
            data-testid="world-hud-toggle"
            className="vuxo-game-hud-toggle"
            size="small"
            aria-expanded={hudExpanded}
            aria-controls="world-hud-details"
            aria-label={t(hudExpanded ? 'game.screen.collapseHud' : 'game.screen.expandHud')}
            title={t('game.screen.hudShortcutHint')}
            onClick={() => setHudExpanded(expanded => !expanded)}
          >
            {hudExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        </Stack>
        <Box id="world-hud-details" data-testid="world-hud-details"
          sx={{ display: hudExpanded ? 'block' : 'none' }}>
          <Typography component="p" className="vuxo-game-eyebrow">{t('game.screen.chapter')}</Typography>
          <Typography component="h1" variant="h6" className="vuxo-game-title">{t('game.title')}</Typography>
        <Stack data-testid="world-presence" direction="row" spacing={0.5} className="vuxo-game-presence">
          {presence.visible.map(player => (
            <Chip
              key={player.playerId}
              size="small"
              variant="outlined"
              label={player.characterName}
              data-testid={player.playerId === selfPlayerId ? 'world-presence-self' : undefined}
              data-self={player.playerId === selfPlayerId ? 'true' : 'false'}
              aria-label={player.playerId === selfPlayerId
                ? t('game.playersSelf', { name: player.characterName }) : undefined}
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
        </Box>
      </Stack>

      <WorldRadar status={status} self={self} players={players} portals={portals} />

      <Stack className="vuxo-game-actions" direction="row" spacing={1}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Button component={RouterLink} to="/refuge" color="inherit" variant="outlined" size="small" className="vuxo-game-button" data-testid="game-refuge-link">
            {t('game.screen.refuge')}
          </Button>
          <IconButton
            data-testid="game-controls-help"
            className="vuxo-game-help-toggle"
            aria-label={t('game.help.open')}
            title={t('game.help.open')}
            aria-haspopup="dialog"
            aria-expanded={controlsOpen}
            disabled={Boolean(activePortal) || portalEntering}
            onClick={openControls}
            size="small"
          >
            <HelpOutlined fontSize="small" />
          </IconButton>
        </Stack>
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
          <Stack id="world-portal-action-list" direction="row" spacing={0.75}
            aria-busy={portalEntering}
            className="vuxo-game-portal-actions" data-testid="world-portal-action-list">
            {portalPreview.visible.map(({ portal, number }) => (
              <Button
                key={portal.id}
                data-testid="world-portal-enter"
                data-grant-id={portal.id}
                data-portal-number={number}
                variant="outlined"
                size="small"
                className="vuxo-game-button"
                disabled={status !== 'connected' || !nearby(portal) ||
                  Boolean(activePortal) || portalEntering || controlsOpen}
                onClick={() => void enter(portal.id)}
              >
                {t('game.portal.enter', { number })}
              </Button>
            ))}
          </Stack>
          {portalEntering && (
            <Typography component="p" role="status" data-testid="world-portal-entering"
              variant="caption" sx={{ color: 'var(--vuxo-game-hud-text)' }}>
              {t('game.portal.entering')}
            </Typography>
          )}
          {portalActions.length > 6 && (
            <Button
              data-testid="world-portal-more"
              aria-controls="world-portal-action-list"
              aria-expanded={allPortalActionsVisible}
              size="small"
              variant="outlined"
              className="vuxo-game-button vuxo-game-portal-expand"
              onClick={() => setAllPortalActionsVisible(value => !value)}
            >
              {allPortalActionsVisible
                ? t('game.portal.showLess')
                : t('game.portal.showMore', { count: portalPreview.hiddenCount })}
            </Button>
          )}
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
          onPointerDown={event => pressTouch(event.pointerId, 0, -1)}
          onPointerUp={event => releaseTouch(event.pointerId)}
          onPointerCancel={event => releaseTouch(event.pointerId)}
          onPointerLeave={event => releaseTouch(event.pointerId)}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 2, gridRow: 1 }}
        >
          <KeyboardArrowUp />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.left')}
          data-testid="touch-left"
          disabled={touchLocked}
          onPointerDown={event => pressTouch(event.pointerId, -1, 0)}
          onPointerUp={event => releaseTouch(event.pointerId)}
          onPointerCancel={event => releaseTouch(event.pointerId)}
          onPointerLeave={event => releaseTouch(event.pointerId)}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 1, gridRow: 2 }}
        >
          <KeyboardArrowLeft />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.down')}
          data-testid="touch-down"
          disabled={touchLocked}
          onPointerDown={event => pressTouch(event.pointerId, 0, 1)}
          onPointerUp={event => releaseTouch(event.pointerId)}
          onPointerCancel={event => releaseTouch(event.pointerId)}
          onPointerLeave={event => releaseTouch(event.pointerId)}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 2, gridRow: 2 }}
        >
          <KeyboardArrowDown />
        </IconButton>
        <IconButton
          aria-label={t('game.controls.right')}
          data-testid="touch-right"
          disabled={touchLocked}
          onPointerDown={event => pressTouch(event.pointerId, 1, 0)}
          onPointerUp={event => releaseTouch(event.pointerId)}
          onPointerCancel={event => releaseTouch(event.pointerId)}
          onPointerLeave={event => releaseTouch(event.pointerId)}
          className="vuxo-game-touch-direction"
          sx={{ gridColumn: 3, gridRow: 2 }}
        >
          <KeyboardArrowRight />
        </IconButton>
      </Box>
      <Dialog
        container={() => screen.current}
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        fullWidth
        maxWidth="xs"
        scroll="paper"
        aria-labelledby="world-controls-guide-title"
        data-testid="world-controls-dialog"
      >
        <DialogTitle id="world-controls-guide-title">{t('game.help.title')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <Typography variant="body2">{t('game.help.intro')}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
              <Typography component="li" variant="body2">{t('game.help.move')}</Typography>
              <Typography component="li" variant="body2">{t('game.help.touch')}</Typography>
              <Typography component="li" variant="body2">{t('game.help.hud')}</Typography>
              <Typography component="li" variant="body2">{t('game.help.radar')}</Typography>
              <Typography component="li" variant="body2">{t('game.help.fullscreen')}</Typography>
              <Typography component="li" variant="body2">{t('game.help.portals')}</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button data-testid="world-controls-close" onClick={() => setControlsOpen(false)}>
            {t('game.help.close')}
          </Button>
        </DialogActions>
      </Dialog>
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
                // This callback fires only after the server accepts the
                // challenge. Ignore pre-completion GET snapshots until the
                // owner-only list confirms removal; no client-side grant.
                completedPortalIds.current.add(grantId)
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
