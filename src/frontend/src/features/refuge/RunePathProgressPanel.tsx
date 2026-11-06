import { Alert, Box, Button, Chip, CircularProgress, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchRunePathPracticeProgress, type RunePathPracticeProgress,
} from './runePathSessionApi';

type Props = {
  accessToken: string;
  refreshSignal: number;
};

export function RunePathProgressPanel({ accessToken, refreshSignal }: Props) {
  const { t } = useTranslation();
  const [manualRefresh, setManualRefresh] = useState(0);
  const [data, setData] = useState<RunePathPracticeProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    void fetchRunePathPracticeProgress(accessToken, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, refreshSignal, manualRefresh]);

  return (
    <Paper variant="outlined" data-testid="path-progress-panel"
      sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" component="h2">
              {t('refuge.path.server.progress.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('refuge.path.server.progress.description')}
            </Typography>
          </Box>
          <Button variant="outlined" data-testid="path-progress-refresh"
            disabled={loading}
            onClick={() => setManualRefresh(value => value + 1)}>
            {t('refuge.path.server.progress.refresh')}
          </Button>
        </Stack>
        {loading && (
          <Stack direction="row" spacing={1}
            sx={{ alignItems: 'center' }} role="status"
            data-testid="path-progress-loading">
            <CircularProgress size={20} />
            <Typography variant="body2">
              {t('refuge.path.server.progress.loading')}
            </Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="warning" data-testid="path-progress-error">
            {t('refuge.path.server.progress.error')}
          </Alert>
        )}
        {!loading && !error && data && (
          <Stack spacing={2} data-testid="path-progress-content">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}
              sx={{ alignItems: { sm: 'center' } }}>
              <Chip data-testid="path-progress-stage" color="primary"
                sx={{ alignSelf: 'flex-start' }}
                label={t('refuge.path.server.progress.milestones.' + data.milestone)} />
              <Typography data-testid="path-progress-counts" variant="body2">
                {t('refuge.path.server.progress.boards', {
                  solved: data.boardsSolved, total: data.totalBoards,
                })}
              </Typography>
              <Typography data-testid="path-progress-total" variant="body2">
                {t('refuge.path.server.progress.completions', {
                  count: data.completedRuns,
                })}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" data-testid="path-progress-bar"
              value={data.totalBoards > 0
                ? Math.min(100, data.boardsSolved / data.totalBoards * 100) : 0}
              aria-label={t('refuge.path.server.progress.boards', {
                solved: data.boardsSolved, total: data.totalBoards,
              })} />
            <Box role="list" data-testid="path-progress-board-list"
              sx={{ display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1 }}>
              {Array.from({ length: data.totalBoards }, (_, puzzleIndex) => {
                const board = data.boards.find(item => item.puzzleIndex === puzzleIndex);
                return (
                  <Box key={puzzleIndex} role="listitem"
                    data-testid={'path-progress-board-' + puzzleIndex}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1,
                      p: 1.5, minWidth: 0 }}>
                    <Typography variant="subtitle2">
                      {t('refuge.path.server.progress.map', { number: puzzleIndex + 1 })}
                    </Typography>
                    {board ? (
                      <Stack spacing={0.5}>
                        <Typography variant="body2">
                          {t('refuge.path.server.progress.best', {
                            count: board.bestSteps,
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('refuge.path.server.progress.boardCompletions', {
                            count: board.completedRuns,
                          })}
                        </Typography>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('refuge.path.server.progress.notSolved')}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Stack>
        )}
        <Alert severity="info" data-testid="path-progress-reward-notice">
          {t('refuge.path.server.progress.noRewards')}
        </Alert>
      </Stack>
    </Paper>
  );
}
