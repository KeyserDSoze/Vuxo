import { ArrowBack, ArrowDownward, ArrowForward, ArrowUpward } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  completeRunePathSession, fetchActiveRunePathSession, fetchRunePathBoard, fetchRunePathSession,
  RunePathSessionApiError, startRunePathSession,
  type RunePathBoard, type RunePathPosition, type RunePathTicket,
} from './runePathSessionApi';

type Direction = 'up' | 'down' | 'left' | 'right';
const offsets: Record<Direction, { x: number; y: number; letter: string }> = {
  up: { x: 0, y: -1, letter: 'U' },
  down: { x: 0, y: 1, letter: 'D' },
  left: { x: -1, y: 0, letter: 'L' },
  right: { x: 1, y: 0, letter: 'R' },
};
const arrowKeys: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
const directionIcons = { up: ArrowUpward, down: ArrowDownward, left: ArrowBack, right: ArrowForward };
const directions: Direction[] = ['up', 'left', 'down', 'right'];
const maxMoves = 32;

type SavedRun = { runId: string; moves: string };

function readSavedRun(key: string): SavedRun | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.runId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(record.runId) ||
      typeof record.moves !== 'string' || !/^[UDLR]{0,32}$/.test(record.moves)) return null;
    return { runId: record.runId, moves: record.moves };
  } catch {
    return null;
  }
}

function saveRun(key: string, run: SavedRun | null) {
  try {
    if (run) sessionStorage.setItem(key, JSON.stringify(run));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage may be unavailable. The server still holds the only real receipt.
  }
}

function validateBoard(board: RunePathBoard, ticket: RunePathTicket): boolean {
  return board.rulesVersion === ticket.rulesVersion
    && board.puzzleIndex === ticket.puzzleIndex
    && board.gridSize === 4
    && board.start.x === 0 && board.start.y === 0
    && board.goal.x === 3 && board.goal.y === 3
    && Array.isArray(board.walls)
    && board.walls.every(wall => Number.isInteger(wall.x) && Number.isInteger(wall.y)
      && wall.x >= 0 && wall.x < 4 && wall.y >= 0 && wall.y < 4);
}

function traceMoves(board: RunePathBoard, moves: string): RunePathPosition | null {
  if (!/^[UDLR]{0,32}$/.test(moves)) return null;
  let x = board.start.x;
  let y = board.start.y;
  for (let index = 0; index < moves.length; index++) {
    const letter = moves[index];
    const offset = Object.values(offsets).find(direction => direction.letter === letter);
    if (!offset) return null;
    x += offset.x;
    y += offset.y;
    if (x < 0 || y < 0 || x >= board.gridSize || y >= board.gridSize
      || board.walls.some(wall => wall.x === x && wall.y === y)) return null;
    // A path that continues after the portal is not a valid proof.
    if (x === board.goal.x && y === board.goal.y && index < moves.length - 1)
      return null;
  }
  return { x, y };
}

function errorCode(error: unknown): string {
  return error instanceof RunePathSessionApiError ? error.code : 'activity_run_unavailable';
}

type Props = { accessToken: string; playerId: string };

export function VerifiedRunePathPanel({ accessToken, playerId }: Props) {
  const { t } = useTranslation();
  // Only an opaque run id + untrusted visual path are stored, never XP or score.
  const storageKey = 'vuxo.refuge.rune-path.run.' + playerId;
  const [ticket, setTicket] = useState<RunePathTicket | null>(null);
  const [board, setBoard] = useState<RunePathBoard | null>(null);
  const [moves, setMoves] = useState('');
  const [bumps, setBumps] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextAllowed, setNextAllowed] = useState<string | null>(null);
  const startKey = useRef<string | null>(null);
  const finishKey = useRef<string | null>(null);
  const controllers = useRef(new Set<AbortController>());

  const makeController = () => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  };
  const release = (controller: AbortController) => controllers.current.delete(controller);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const recover = async (controller: AbortController) => {
    const saved = readSavedRun(storageKey);
    try {
      let remote: RunePathTicket | null = null;
      let visualMoves = saved?.moves ?? '';
      if (saved) {
        try {
          remote = await fetchRunePathSession(accessToken, saved.runId, controller.signal);
        } catch (reason) {
          if (!(reason instanceof RunePathSessionApiError) ||
              reason.code !== 'activity_run_not_found') throw reason;
          // A deleted/foreign ticket must not block discovering the owner's
          // actual active run on another browser or device.
          saveRun(storageKey, null);
          visualMoves = '';
        }
      }
      if (!remote) {
        remote = await fetchActiveRunePathSession(accessToken, controller.signal);
        visualMoves = ''; // Another device's steps are never assumed.
      }
      if (controller.signal.aborted) return;
      if (!remote) {
        setTicket(null);
        setBoard(null);
        setMoves('');
        return;
      }
      if (remote.state === 'completed' || remote.state === 'expired') {
        setTicket(remote);
        setBoard(null);
        setMoves('');
        saveRun(storageKey, { runId: remote.runId, moves: '' });
        return;
      }
      const canonical = await fetchRunePathBoard(remote.puzzleIndex, controller.signal);
      if (controller.signal.aborted) return;
      if (!validateBoard(canonical, remote))
        throw new RunePathSessionApiError('activity_run_invalid_board', 502);
      const restoredMoves = traceMoves(canonical, visualMoves) === null ? '' : visualMoves;
      setTicket(remote);
      setBoard(canonical);
      setMoves(restoredMoves);
      saveRun(storageKey, { runId: remote.runId, moves: restoredMoves });
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(errorCode(reason));
    }
  };

  useEffect(() => {
    const controller = makeController();
    setTicket(null);
    setBoard(null);
    setMoves('');
    setBumps(0);
    setError(null);
    setRecovering(true);
    void recover(controller).finally(() => {
      if (!controller.signal.aborted) {
        setRecovering(false);
        release(controller);
      }
    });
    return () => {
      controllers.current.forEach(item => item.abort());
      controllers.current.clear();
      startKey.current = null;
      finishKey.current = null;
    };
    // Key changes on account switch, and previous requests are aborted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, storageKey]);

  const start = async () => {
    if (busy || recovering) return;
    const key = startKey.current ?? crypto.randomUUID();
    startKey.current = key;
    const controller = makeController();
    setBusy(true);
    setError(null);
    try {
      const remote = await startRunePathSession(accessToken, key, controller.signal);
      if (controller.signal.aborted) return;
      saveRun(storageKey, { runId: remote.runId, moves: '' });
      setTicket(remote);
      setBoard(null);
      setMoves('');
      setBumps(0);
      startKey.current = null;
      const canonical = await fetchRunePathBoard(remote.puzzleIndex, controller.signal);
      if (controller.signal.aborted) return;
      if (!validateBoard(canonical, remote))
        throw new RunePathSessionApiError('activity_run_invalid_board', 502);
      setBoard(canonical);
    } catch (reason) {
      if (!controller.signal.aborted) {
        const code = errorCode(reason);
        // Only retry a transport failure with the original idempotency key.
        if (reason instanceof RunePathSessionApiError && reason.status < 500)
          startKey.current = null;
        setError(code);
        setNextAllowed(reason instanceof RunePathSessionApiError
          ? reason.nextAllowedAtUtc ?? null : null);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      release(controller);
    }
  };

  const resume = async () => {
    if (busy) return;
    const controller = makeController();
    setBusy(true);
    setError(null);
    try {
      await recover(controller);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      release(controller);
    }
  };

  const expired = !!ticket && (ticket.state === 'expired' ||
    (ticket.state === 'active' && Date.parse(ticket.expiresAtUtc) <= now));
  const position = board ? (traceMoves(board, moves) ?? board.start) : null;
  const reached = !!board && !!position &&
    position.x === board.goal.x && position.y === board.goal.y;
  const remaining = ticket ? Math.max(0,
    Math.ceil((Date.parse(ticket.expiresAtUtc) - now) / 1000)) : 0;
  const playing = !!ticket && !!board && ticket.state === 'active' && !expired;

  const advance = (direction: Direction) => {
    if (!playing || busy || reached || !position || !board) return;
    const offset = offsets[direction];
    const x = position.x + offset.x;
    const y = position.y + offset.y;
    if (x < 0 || y < 0 || x >= board.gridSize || y >= board.gridSize
      || board.walls.some(wall => wall.x === x && wall.y === y)
      || moves.length >= maxMoves) {
      setBumps(value => value + 1);
      return;
    }
    const next = moves + offset.letter;
    setMoves(next);
    saveRun(storageKey, { runId: ticket!.runId, moves: next });
    finishKey.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = arrowKeys[event.key];
    if (direction && playing) {
      event.preventDefault();
      advance(direction);
    }
  };

  const submit = async () => {
    if (!playing || !reached || busy || !ticket || !moves) return;
    const controller = makeController();
    const key = finishKey.current ?? crypto.randomUUID();
    finishKey.current = key;
    setBusy(true);
    setError(null);
    try {
      const result = await completeRunePathSession(
        accessToken, ticket.runId, key, moves, controller.signal);
      if (controller.signal.aborted) return;
      setTicket(result);
      finishKey.current = null;
      saveRun(storageKey, { runId: result.runId, moves: '' });
    } catch (reason) {
      if (!controller.signal.aborted) {
        const code = errorCode(reason);
        if (reason instanceof RunePathSessionApiError && reason.status < 500)
          finishKey.current = null;
        setError(code);
        if (code === 'activity_run_expired')
          setTicket(current => current ? { ...current, state: 'expired' } : null);
        if (code === 'activity_run_completed')
          await recover(controller);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      release(controller);
    }
  };

  const resetPath = () => {
    if (!ticket || !playing || busy) return;
    setMoves('');
    setBumps(0);
    finishKey.current = null;
    saveRun(storageKey, { runId: ticket.runId, moves: '' });
    setError(null);
  };

  const newAttempt = () => {
    saveRun(storageKey, null);
    setTicket(null);
    setBoard(null);
    setMoves('');
    setBumps(0);
    setError(null);
    finishKey.current = null;
    startKey.current = null;
  };

  return (
    <Paper variant="outlined" data-testid="verified-path-panel"
      sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <Stack spacing={2.5}>
        <Typography variant="h6" component="h2">{t('refuge.path.server.title')}</Typography>
        <Alert severity="info" data-testid="verified-path-disclaimer">
          {t('refuge.path.server.disclaimer')}
        </Alert>
        {error && (
          <Alert severity="warning" data-testid="verified-path-error">
            {t('refuge.path.server.errors.' + error, {
              defaultValue: t('refuge.path.server.errors.generic'),
            })}
            {nextAllowed && ' ' + t('refuge.path.server.nextAllowed', {
              time: new Date(nextAllowed).toLocaleTimeString(),
            })}
          </Alert>
        )}
        {(busy || recovering) && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}
            role="status" data-testid="verified-path-loading">
            <CircularProgress size={20} />
            <Typography>{t('refuge.path.server.loading')}</Typography>
          </Stack>
        )}

        {!recovering && !ticket && error === 'activity_run_active' && (
          <Button variant="outlined" data-testid="verified-path-discover"
            disabled={busy} onClick={() => { void resume(); }}>
            {t('refuge.path.server.discover')}
          </Button>
        )}
        {!recovering && !ticket && (
          <Stack spacing={1.5} sx={{ alignItems: "flex-start" }} data-testid="verified-path-ready">
            <Typography color="text.secondary">{t('refuge.path.server.instructions')}</Typography>
            <Button variant="contained" data-testid="verified-path-start"
              disabled={busy} onClick={() => { void start(); }}>
              {t('refuge.path.server.start')}
            </Button>
          </Stack>
        )}

        {ticket && (
          <Stack spacing={1.5}>
            <Chip data-testid="verified-path-status"
              sx={{ alignSelf: 'flex-start' }}
              label={t('refuge.path.server.states.' + (expired ? 'expired' : ticket.state))} />
            <Typography data-testid="verified-path-id" variant="caption" color="text.secondary">
              {t('refuge.path.server.runId', { id: ticket.runId })}
            </Typography>
            {playing && (
              <Typography data-testid="verified-path-remaining" role="timer" aria-live="off">
                {t('refuge.path.server.remaining', { seconds: remaining })}
              </Typography>
            )}
            {ticket.state === 'completed' && (
              <Alert severity="success" data-testid="verified-path-completed">
                {t('refuge.path.server.completed', { count: ticket.stepsChecked ?? 0 })}
              </Alert>
            )}
            {expired && (
              <Alert severity="warning" data-testid="verified-path-expired">
                {t('refuge.path.server.expired')}
              </Alert>
            )}
          </Stack>
        )}

        {playing && board && position && (
          <Stack spacing={2} data-testid="verified-path-game" onKeyDown={onKeyDown}>
            <Typography variant="body2" color="text.secondary"
              data-testid="verified-path-puzzle">
              {t('refuge.path.server.puzzle', { number: ticket!.puzzleIndex + 1 })}
            </Typography>
            <Box
              role="group"
              tabIndex={0}
              data-testid="verified-path-board"
              aria-label={t('refuge.path.board')}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 0.75, maxWidth: 480, width: '100%',
                '&:focus-visible': {
                  outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3,
                },
              }}
            >
              {Array.from({ length: board.gridSize * board.gridSize }, (_, index) => {
                const x = index % board.gridSize;
                const y = Math.floor(index / board.gridSize);
                const wall = board.walls.some(cell => cell.x === x && cell.y === y);
                const current = x === position.x && y === position.y;
                const goal = x === board.goal.x && y === board.goal.y;
                const adjacent = Math.abs(x - position.x) + Math.abs(y - position.y) === 1;
                const label = current ? 'player' : wall ? 'wall' : goal ? 'goal' : 'floor';
                return (
                  <Button
                    key={index}
                    data-testid={'verified-path-cell-' + x + '-' + y}
                    aria-label={t('refuge.path.cell', {
                      column: x + 1, row: y + 1, type: t('refuge.path.' + label),
                    })}
                    data-wall={String(wall)}
                    data-current={String(current)}
                    disabled={busy || reached || wall || !adjacent}
                    onClick={() => advance(x < position.x ? 'left'
                      : x > position.x ? 'right' : y < position.y ? 'up' : 'down')}
                    variant={current ? 'contained' : 'outlined'}
                    color={goal ? 'success' : 'primary'}
                    sx={{ minWidth: 0, minHeight: { xs: 56, sm: 75 }, px: 0.5, fontWeight: 700 }}
                  >
                    {t('refuge.path.' + label)}
                  </Button>
                );
              })}
            </Box>
            <Box role="group" aria-label={t('refuge.path.controls')}
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {directions.map(direction => {
                const Icon = directionIcons[direction];
                return (
                  <Button key={direction} variant="outlined"
                    data-testid={'verified-path-step-' + direction}
                    startIcon={<Icon />} disabled={busy || reached}
                    onClick={() => advance(direction)} sx={{ minHeight: 44 }}>
                    {t('refuge.path.directions.' + direction)}
                  </Button>
                );
              })}
            </Box>
            <Typography role="status" aria-live="polite" data-testid="verified-path-position">
              {t('refuge.path.position', {
                column: position.x + 1, row: position.y + 1,
              })}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Chip data-testid="verified-path-moves"
                label={t('refuge.path.moves', { count: moves.length })} />
              <Chip data-testid="verified-path-bumps"
                label={t('refuge.path.bumps', { count: bumps })} />
            </Stack>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button variant="contained" data-testid="verified-path-submit"
                disabled={!reached || busy} onClick={() => { void submit(); }}>
                {t('refuge.path.server.submit')}
              </Button>
              <Button variant="outlined" data-testid="verified-path-reset"
                disabled={busy || !moves} onClick={resetPath}>
                {t('refuge.path.server.reset')}
              </Button>
            </Stack>
          </Stack>
        )}

        {ticket && !playing && !recovering && (
          <Button data-testid="verified-path-new" variant="outlined"
            disabled={busy} sx={{ alignSelf: 'flex-start' }} onClick={newAttempt}>
            {t('refuge.path.server.new')}
          </Button>
        )}
        {ticket && ticket.state === 'active' && !board && !expired && !recovering && (
          <Button data-testid="verified-path-recover" disabled={busy}
            onClick={() => { void resume(); }}>
            {t('refuge.path.server.resume')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
