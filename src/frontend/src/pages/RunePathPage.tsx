import { ArrowBack, ArrowDownward, ArrowForward, ArrowUpward, RouteOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { DeckPageHeader } from '../components/DeckPageHeader';
import { getApiBaseUrl } from '../features/character/appearance';

// Three small, fixed, solvable puzzles. These are local practice maps, never
// server-verified portal layouts or authoritative player positions.
type Position = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
type PathHint = { direction: Direction; remaining: number };
const size = 4;
const startPosition: Position = { x: 0, y: 0 };
const goalPosition: Position = { x: size - 1, y: size - 1 };
const walls: readonly (readonly Position[])[] = [
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
  [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
  [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 2 }],
];
const offsets: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const arrows: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
const directions: readonly Direction[] = ['up', 'left', 'down', 'right'];
const icons = { up: ArrowUpward, down: ArrowDownward, left: ArrowBack, right: ArrowForward };

function isWall(puzzle: number, x: number, y: number): boolean {
  return walls[puzzle].some(wall => wall.x === x && wall.y === y);
}

// Breadth-first search finds a shortest orthogonal route. The fixed direction
// order makes ties reproducible; the hint never changes the player position.
function getShortestPathHint(puzzle: number, from: Position): PathHint | null {
  const queue: { point: Position; first: Direction | null; steps: number }[] = [
    { point: from, first: null, steps: 0 },
  ];
  const visited = new Set([from.x + ',' + from.y]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.point.x === goalPosition.x && current.point.y === goalPosition.y) {
      return current.first ? { direction: current.first, remaining: current.steps } : null;
    }
    for (const direction of directions) {
      const offset = offsets[direction];
      const point = { x: current.point.x + offset.x, y: current.point.y + offset.y };
      const key = point.x + ',' + point.y;
      if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size
        || isWall(puzzle, point.x, point.y) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ point, first: current.first ?? direction, steps: current.steps + 1 });
    }
  }
  return null;
}


// This is compatibility of a *public practice geometry*, NOT validation of a
// player's run, a reward entitlement, or a server-owned activity session.
type RulesStatus = 'checking' | 'matched' | 'local';
type RulesCheck = { puzzle: number; status: RulesStatus };
function matchesPublicPracticeRules(value: unknown, puzzle: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.rulesVersion !== 'rune-path-practice-v1' || data.puzzleIndex !== puzzle
    || data.gridSize !== size || !Array.isArray(data.walls)
    || data.walls.length !== walls[puzzle].length) return false;
  const isPoint = (point: unknown, x: number, y: number) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
    const p = point as Record<string, unknown>;
    return p.x === x && p.y === y;
  };
  if (!isPoint(data.start, startPosition.x, startPosition.y)
    || !isPoint(data.goal, goalPosition.x, goalPosition.y)) return false;
  const expected = new Set(walls[puzzle].map(wall => wall.x + ',' + wall.y));
  const seen = new Set<string>();
  for (const item of data.walls) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const point = item as Record<string, unknown>;
    if (typeof point.x !== 'number' || typeof point.y !== 'number'
      || !Number.isInteger(point.x) || !Number.isInteger(point.y)) return false;
    const key = point.x + ',' + point.y;
    if (!expected.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return seen.size === expected.size;
}

export function RunePathPage() {
  const { t } = useTranslation();
  const [puzzle, setPuzzle] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'completed'>('ready');
  const [position, setPosition] = useState<Position>(startPosition);
  const [moves, setMoves] = useState(0);
  const [bumps, setBumps] = useState(0);
  const [history, setHistory] = useState<Position[]>([]);
  const [hint, setHint] = useState<PathHint | null>(null);
  const [rulesCheck, setRulesCheck] = useState<RulesCheck>({ puzzle: 0, status: 'checking' });
  // Retain local gameplay when the public API is down (including Cloudflare
  // 502). Ignore stale responses across navigation and puzzle changes.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setRulesCheck({ puzzle, status: 'local' });
    }, 4000);
    setRulesCheck({ puzzle, status: 'checking' });
    void fetch(getApiBaseUrl() + '/api/activities/rune-path/puzzles/' + puzzle, {
      method: 'GET', cache: 'no-store', credentials: 'omit', signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return false;
      const payload: unknown = await response.json();
      return matchesPublicPracticeRules(payload, puzzle);
    }).then(matched => {
      if (!controller.signal.aborted) {
        setRulesCheck({ puzzle, status: matched ? 'matched' : 'local' });
      }
    }).catch(() => {
      if (!controller.signal.aborted) setRulesCheck({ puzzle, status: 'local' });
    }).finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [puzzle]);
  const rulesStatus: RulesStatus = rulesCheck.puzzle === puzzle ? rulesCheck.status : 'checking';

  const start = () => {
    setPosition(startPosition);
    setMoves(0);
    setBumps(0);
    setHistory([]);
    setHint(null);
    setPhase('playing');
  };

  const advance = (direction: Direction) => {
    if (phase !== 'playing') return;
    const offset = offsets[direction];
    const next = { x: position.x + offset.x, y: position.y + offset.y };
    if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size
      || isWall(puzzle, next.x, next.y)) {
      setBumps(value => value + 1);
      return;
    }
    setHistory(value => [...value, position]);
    setHint(null);
    setPosition(next);
    setMoves(value => value + 1);
    if (next.x === goalPosition.x && next.y === goalPosition.y) {
      setPhase('completed');
    }
  };

  const undo = () => {
    if (phase !== 'playing' || history.length === 0) return;
    setPosition(history[history.length - 1]);
    setHint(null);
    setHistory(value => value.slice(0, -1));
    setMoves(value => value - 1);
  };

  const showHint = () => {
    if (phase !== 'playing') return;
    setHint(getShortestPathHint(puzzle, position));
  };

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = arrows[event.key];
    if (direction && phase === 'playing') {
      event.preventDefault();
      advance(direction);
    }
  };

  const nextPuzzle = () => {
    setPuzzle(value => (value + 1) % walls.length);
    setPhase('ready');
    setPosition(startPosition);
    setMoves(0);
    setBumps(0);
    setHistory([]);
    setHint(null);
  };

  return (
    <Stack spacing={3} data-testid="rune-path-page">
      <DeckPageHeader
        icon={RouteOutlined}
        eyebrow={t('refuge.path.eyebrow')}
        title={t('refuge.path.title')}
        description={t('refuge.path.description')}
      />
      <Alert data-testid="path-disclaimer" severity="info">{t('refuge.path.disclaimer')}</Alert>
      <Alert
        severity={rulesStatus === 'matched' ? 'success' : 'info'}
        role="status"
        aria-live="polite"
        data-testid="path-rules-status"
        data-status={rulesStatus}
      >
        {t('refuge.path.rulesStatus.' + rulesStatus)}
      </Alert>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
        <Stack spacing={2.5}>
          <Typography variant="h6" data-testid="path-puzzle">
            {t('refuge.path.puzzle', { current: puzzle + 1, total: walls.length })}
          </Typography>
          {phase === 'ready' && (
            <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }} data-testid="path-ready">
              <Typography>{t('refuge.path.instructions')}</Typography>
              <Button variant="contained" data-testid="path-start" onClick={start}>
                {t('refuge.path.start')}
              </Button>
            </Stack>
          )}

          {phase !== 'ready' && (
            <Box onKeyDown={keyboard} data-testid="path-game" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box
                data-testid="path-board"
                role="group"
                tabIndex={0}
                aria-label={t('refuge.path.board')}
                sx={{ width: '100%', maxWidth: 480, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3 } }}
              >
                {Array.from({ length: size * size }, (_, index) => {
                  const x = index % size;
                  const y = Math.floor(index / size);
                  const blocked = isWall(puzzle, x, y);
                  const current = x === position.x && y === position.y;
                  const goal = x === goalPosition.x && y === goalPosition.y;
                  const adjacent = Math.abs(x - position.x) + Math.abs(y - position.y) === 1;
                  const label = current ? 'player' : blocked ? 'wall' : goal ? 'goal' : 'floor';
                  return (
                    <Button
                      key={index}
                      data-testid={`path-cell-${x}-${y}`}
                      data-wall={String(blocked)}
                      data-current={String(current)}
                      aria-label={t('refuge.path.cell', { column: x + 1, row: y + 1, type: t('refuge.path.' + label) })}
                      variant={current ? 'contained' : 'outlined'}
                      color={goal ? 'success' : 'primary'}
                      disabled={phase !== 'playing' || blocked || !adjacent}
                      onClick={() => advance(x < position.x ? 'left' : x > position.x ? 'right' : y < position.y ? 'up' : 'down')}
                      sx={{ minWidth: 0, minHeight: { xs: 56, sm: 75 }, px: 0.5, fontWeight: 700 }}
                    >
                      {t('refuge.path.' + label)}
                    </Button>
                  );
                })}
              </Box>
              {phase === 'playing' && (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">{t('refuge.path.controls')}</Typography>
                  <Box role="group" aria-label={t('refuge.path.controls')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {directions.map(direction => {
                      const Icon = icons[direction];
                      return (
                        <Button
                          key={direction}
                          data-testid={'path-step-' + direction}
                          onClick={() => advance(direction)}
                          variant="outlined"
                          startIcon={<Icon />}
                          sx={{ minHeight: 44 }}
                        >
                          {t('refuge.path.directions.' + direction)}
                        </Button>
                      );
                    })}
                    <Button
                      data-testid="path-undo"
                      variant="outlined"
                      disabled={history.length === 0}
                      onClick={undo}
                      sx={{ minHeight: 44 }}
                    >
                      {t('refuge.path.undo')}
                    </Button>
                    <Button
                      data-testid="path-hint"
                      variant="outlined"
                      onClick={showHint}
                      sx={{ minHeight: 44 }}
                    >
                      {t('refuge.path.hintAction')}
                    </Button>
                  </Box>
                  {hint && (
                    <Alert data-testid="path-hint-feedback" severity="info" role="status" aria-live="polite">
                      {t('refuge.path.hintFeedback', {
                        direction: t('refuge.path.directions.' + hint.direction),
                        count: hint.remaining,
                      })}
                    </Alert>
                  )}
                </Stack>
              )}
              <Typography data-testid="path-position" role="status" aria-live="polite">
                {t('refuge.path.position', { column: position.x + 1, row: position.y + 1 })}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Chip data-testid="path-moves" label={t('refuge.path.moves', { count: moves })} />
                <Chip data-testid="path-bumps" label={t('refuge.path.bumps', { count: bumps })} />
              </Stack>
            </Box>
          )}

          {phase === 'completed' && (
            <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }} data-testid="path-complete">
              <Alert severity="success">{t('refuge.path.complete')}</Alert>
              <Button variant="contained" data-testid="path-next" onClick={nextPuzzle}>
                {t(puzzle === walls.length - 1 ? 'refuge.path.again' : 'refuge.path.next')}
              </Button>
            </Stack>
          )}
          {phase !== 'ready' && (
            <Button data-testid="path-restart" variant="outlined" onClick={start} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
              {t('refuge.path.restart')}
            </Button>
          )}
          <Button data-testid="path-back" component={RouterLink} to="/refuge" sx={{ alignSelf: 'flex-start' }}>
            {t('refuge.path.back')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
