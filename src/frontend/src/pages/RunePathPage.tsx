import { ArrowBack, ArrowDownward, ArrowForward, ArrowUpward } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

// Three small, fixed, solvable puzzles. These are local practice maps, never
// server-verified portal layouts or authoritative player positions.
type Position = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
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

export function RunePathPage() {
  const { t } = useTranslation();
  const [puzzle, setPuzzle] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'completed'>('ready');
  const [position, setPosition] = useState<Position>(startPosition);
  const [moves, setMoves] = useState(0);
  const [bumps, setBumps] = useState(0);

  const start = () => {
    setPosition(startPosition);
    setMoves(0);
    setBumps(0);
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
    setPosition(next);
    setMoves(value => value + 1);
    if (next.x === goalPosition.x && next.y === goalPosition.y) {
      setPhase('completed');
    }
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
  };

  return (
    <Stack spacing={3} data-testid="rune-path-page">
      <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">{t('refuge.path.eyebrow')}</Typography>
        <Typography component="h1" variant="h2" sx={{ typography: { xs: 'h4', sm: 'h2' }, overflowWrap: 'anywhere' }}>{t('refuge.path.title')}</Typography>
        <Typography color="text.secondary">{t('refuge.path.description')}</Typography>
      </Stack>
      <Alert data-testid="path-disclaimer" severity="info">{t('refuge.path.disclaimer')}</Alert>

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
                  </Box>
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
          <Button data-testid="path-back" component={RouterLink} to="/refuge" sx={{ alignSelf: 'flex-start' }}>
            {t('refuge.path.back')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
