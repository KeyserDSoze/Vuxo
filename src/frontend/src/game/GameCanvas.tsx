import { KeyboardArrowDown, KeyboardArrowLeft, KeyboardArrowRight, KeyboardArrowUp } from '@mui/icons-material'
import { Box, Chip, IconButton, Stack, Typography } from '@mui/material'
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

export function GameCanvas() {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const realtime = useRef<WorldRealtimeClient | null>(null)
  const [status, setStatus] = useState<WorldConnectionStatus>('idle')
  const [players, setPlayers] = useState<WorldPlayerSnapshot[]>([])
  const [errorCode, setErrorCode] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return

    const client = createWorldRealtimeClient()
    realtime.current = client
    const unsubscribe = client.subscribe(state => {
      setStatus(state.status)
      setPlayers([...state.players.values()].sort((a, b) => a.characterName.localeCompare(b.characterName)))
      setErrorCode(state.errorCode)
    })

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
      scene: [new WorldScene(client)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    })

    void client.connect()

    return () => {
      unsubscribe()
      realtime.current = null
      game.destroy(true)
      void client.disconnect()
    }
  }, [])

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
            />
          ))}
        </Stack>
      </Stack>

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
    </Stack>
  )
}
