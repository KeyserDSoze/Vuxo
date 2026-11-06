import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchRunePathHistory, type RunePathHistoryEntry,
} from './runePathSessionApi';

type Props = {
  accessToken: string;
  refreshSignal: number;
};

export function RunePathHistoryPanel({ accessToken, refreshSignal }: Props) {
  const { t, i18n } = useTranslation();
  const [manualRefresh, setManualRefresh] = useState(0);
  const [history, setHistory] = useState<RunePathHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Changing authenticated users unmounts the keyed parent. Aborting the
  // previous request avoids showing a prior owner's history in another account.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetchRunePathHistory(accessToken, controller.signal)
      .then(items => {
        if (!controller.signal.aborted) setHistory(items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, refreshSignal, manualRefresh]);

  const locale = i18n.language.startsWith('it') ? 'it-IT' : 'en-US';
  const formatDate = (utc: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(utc));

  return (
    <Paper variant="outlined" data-testid="path-history-panel"
      sx={{ p: { xs: 2, sm: 3 }, mt: 0 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Box>
            <Typography component="h2" variant="h6">
              {t('refuge.path.server.history.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('refuge.path.server.history.description')}
            </Typography>
          </Box>
          <Button variant="outlined" data-testid="path-history-refresh"
            disabled={loading}
            onClick={() => setManualRefresh(value => value + 1)}>
            {t('refuge.path.server.history.refresh')}
          </Button>
        </Stack>
        {error && (
          <Alert data-testid="path-history-error" severity="warning">
            {t('refuge.path.server.history.error')}
          </Alert>
        )}
        {loading && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}
            data-testid="path-history-loading" role="status">
            <CircularProgress size={20} />
            <Typography variant="body2">
              {t('refuge.path.server.history.loading')}
            </Typography>
          </Stack>
        )}
        {!loading && !error && history.length === 0 && (
          <Typography color="text.secondary" data-testid="path-history-empty">
            {t('refuge.path.server.history.empty')}
          </Typography>
        )}
        {!loading && !error && history.length > 0 && (
          <Stack spacing={1.5} role="list" data-testid="path-history-list">
            {history.map(run => (
              <Box key={run.runId} role="listitem" data-testid="path-history-item"
                sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">
                      {t('refuge.path.server.history.map', {
                        number: run.puzzleIndex + 1,
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(run.startedAtUtc)}
                    </Typography>
                    {run.state === 'completed' && (
                      <Typography variant="body2">
                        {t('refuge.path.server.history.steps', {
                          count: run.stepsChecked ?? 0,
                        })}
                      </Typography>
                    )}
                  </Stack>
                  <Chip sx={{ alignSelf: 'flex-start' }}
                    label={t('refuge.path.server.states.' + run.state)}
                    color={run.state === 'completed' ? 'success'
                      : run.state === 'expired' ? 'default' : 'primary'}
                    size="small" />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
