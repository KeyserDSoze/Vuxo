import { AutoAwesome, Refresh } from '@mui/icons-material';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchCompletedPortals, type CompletedPortal } from '../portals/portalHistoryApi';

/**
 * Paginated, read-only verified sequence completions.
 * The parent remounts this component on refresh/account change so no owner
 * data or older pagination pages leak into a new read snapshot.
 */
export function RefugePortalCompletionHistory() {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<CompletedPortal[]>([]);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    if (page === 1) setEntries([]);
    void fetchCompletedPortals(page, 20, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setEntries(previous => page === 1 ? result.items : [...previous, ...result.items]);
        setHasMore(result.hasMore);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt]);

  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'it-IT';
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      : t('refuge.journal.dateUnavailable');
  };

  function refresh() {
    setEntries([]);
    setHasMore(false);
    setLoading(true);
    setPage(1);
    setAttempt(previous => previous + 1);
  }

  return (
    <Paper component="section" aria-labelledby="refuge-journal-completed-title"
      data-testid="refuge-journal-completed" variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Box>
            <Typography id="refuge-journal-completed-title" component="h2"
              variant="h5" sx={{ fontWeight: 800 }}>
              {t('refuge.journal.completed.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('refuge.journal.completed.description')}
            </Typography>
          </Box>
          <Button data-testid="refuge-journal-completed-refresh" startIcon={<Refresh />}
            variant="outlined" disabled={loading} onClick={refresh}
            sx={{ flexShrink: 0, alignSelf: 'flex-start' }}>
            {t('refuge.journal.retry')}
          </Button>
        </Stack>

        {loading && (
          <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}
            data-testid="refuge-journal-completed-loading">
            <CircularProgress size={23} />
            <Typography>{t('refuge.journal.completed.loading')}</Typography>
          </Stack>
        )}
        {error && (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Alert severity="warning" data-testid="refuge-journal-completed-error" role="status">
              {t('refuge.journal.completed.error')}
            </Alert>
            <Button data-testid="refuge-journal-completed-retry" onClick={() => setAttempt(v => v + 1)}>
              {t('refuge.journal.retry')}
            </Button>
          </Stack>
        )}
        {!loading && !error && entries.length === 0 && (
          <Alert severity="info" data-testid="refuge-journal-completed-empty">
            {t('refuge.journal.completed.empty')}
          </Alert>
        )}
        <Stack spacing={1.25} data-testid="refuge-journal-completed-list">
          {entries.map(item => (
            <Paper key={item.grantId} variant="outlined"
              data-testid="refuge-journal-completed-entry" sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }}
                sx={{ gap: 1, justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                    <AutoAwesome fontSize="small" color="primary" aria-hidden="true" />
                    <Typography sx={{ fontWeight: 800 }}>
                      {t('refuge.journal.completed.verified')}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t('refuge.journal.completed.at', { date: formatDate(item.completedAtUtc) })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {t('refuge.journal.completed.reference', { reference: item.grantId.slice(0, 8) })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {t('refuge.journal.completed.source', { key: item.contentKey })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('refuge.journal.completed.rule', { version: item.ruleVersion })}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
        {!loading && !error && hasMore && (
          <Button data-testid="refuge-journal-completed-more" variant="outlined"
            onClick={() => setPage(value => value + 1)} sx={{ alignSelf: 'flex-start' }}>
            {t('refuge.journal.completed.more')}
          </Button>
        )}
        <Typography variant="caption" color="text.secondary"
          data-testid="refuge-journal-completed-disclaimer">
          {t('refuge.journal.completed.disclaimer')}
        </Typography>
      </Stack>
    </Paper>
  );
}
