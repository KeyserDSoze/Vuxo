import { AutoAwesome, Refresh } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { inventoryItemLabelKeys } from '../inventory/inventoryApi';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readForCurrentOwner } from '../auth/ownerReadFence';
import { appendPortalHistoryPage, type HistoryEntry, type HistoryMode } from './portalHistoryPageMerge';
import { fetchCompletedPortals, fetchPortalOutcomes,
  type PortalCompletionPage, type PortalOutcomePage } from '../portals/portalHistoryApi';

/**
 * Paginated, read-only verified sequence completions.
 * The parent remounts this component on refresh/account change so no owner
 * data or older pagination pages leak into a new read snapshot.
 */
 export function RefugePortalCompletionHistory({ accessToken }: { accessToken: string }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<HistoryMode>('completed');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  // React state alone is not a synchronous pagination cursor: response
  // validation must inspect the exact latest accepted page before appending.
  const acceptedEntries = useRef<HistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    if (page === 1) {
      acceptedEntries.current = [];
      setEntries([]);
    }
    void readForCurrentOwner<PortalCompletionPage | PortalOutcomePage>(accessToken, () => mode === 'completed'
      ? fetchCompletedPortals(page, 20, controller.signal)
      : fetchPortalOutcomes(page, 20, controller.signal), controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        // Offset pagination can overlap when another device inserts a
        // completion between GET page 1 and GET page 2. Do not display
        // duplicate grants/events or a newer row after an older one.
        const next = appendPortalHistoryPage(acceptedEntries.current, result.items, mode, page);
        acceptedEntries.current = next;
        setEntries(next);
        setHasMore(result.hasMore);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // On a partial-page error even the earlier pages may be stale.
        // Clear everything and force a fresh page-one retry.
        acceptedEntries.current = [];
        setEntries([]);
        setHasMore(false);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt, mode, accessToken]);

  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'it-IT';
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      : t('refuge.journal.dateUnavailable');
  };

  function refresh() {
    acceptedEntries.current = [];
    setEntries([]);
    setHasMore(false);
    setLoading(true);
    setPage(1);
    setAttempt(previous => previous + 1);
  }

  function chooseMode(nextMode: HistoryMode) {
    if (nextMode === mode) return;
    acceptedEntries.current = [];
    setEntries([]);
    setHasMore(false);
    setLoading(true);
    setError(false);
    setPage(1);
    setMode(nextMode);
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
              {t(mode === 'completed'
                ? 'refuge.journal.completed.title'
                : 'refuge.journal.outcomes.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(mode === 'completed'
                ? 'refuge.journal.completed.description'
                : 'refuge.journal.outcomes.description')}
            </Typography>
          </Box>
          <Button data-testid="refuge-journal-completed-refresh" startIcon={<Refresh />}
            variant="outlined" disabled={loading} onClick={refresh}
            sx={{ flexShrink: 0, alignSelf: 'flex-start' }}>
            {t('refuge.journal.retry')}
          </Button>
        </Stack>

        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} role="group"
          aria-label={t('refuge.journal.outcomes.modeLabel')}>
          <Button data-testid="refuge-journal-mode-completed"
            aria-pressed={mode === 'completed'}
            variant={mode === 'completed' ? 'contained' : 'outlined'}
            onClick={() => chooseMode('completed')} size="small">
            {t('refuge.journal.outcomes.modes.completed')}
          </Button>
          <Button data-testid="refuge-journal-mode-outcomes"
            aria-pressed={mode === 'outcomes'}
            variant={mode === 'outcomes' ? 'contained' : 'outlined'}
            onClick={() => chooseMode('outcomes')} size="small">
            {t('refuge.journal.outcomes.modes.all')}
          </Button>
        </Stack>

        {loading && (
          <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}
            data-testid="refuge-journal-completed-loading">
            <CircularProgress size={23} />
            <Typography>{t(mode === 'completed'
              ? 'refuge.journal.completed.loading'
              : 'refuge.journal.outcomes.loading')}</Typography>
          </Stack>
        )}
        {error && (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Alert severity="warning" data-testid="refuge-journal-completed-error" role="status">
              {t(mode === 'completed'
                ? 'refuge.journal.completed.error'
                : 'refuge.journal.outcomes.error')}
            </Alert>
            <Button data-testid="refuge-journal-completed-retry" onClick={refresh}>
              {t('refuge.journal.retry')}
            </Button>
          </Stack>
        )}
        {!loading && !error && entries.length === 0 && (
          <Alert severity="info" data-testid="refuge-journal-completed-empty">
            {t(mode === 'completed'
              ? 'refuge.journal.completed.empty'
              : 'refuge.journal.outcomes.empty')}
          </Alert>
        )}
        <Stack spacing={1.25} data-testid="refuge-journal-completed-list">
          {entries.map(item => {
            const isOutcome = 'kind' in item;
            const outcomeKind = isOutcome ? item.kind : 'sequence_completed';
            const date = isOutcome ? item.occurredAtUtc : item.completedAtUtc;
            return (
            <Paper key={isOutcome ? item.eventId : item.grantId} variant="outlined"
              data-kind={outcomeKind} data-testid="refuge-journal-completed-entry" sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }}
                sx={{ gap: 1, justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}>
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                    <AutoAwesome fontSize="small" color="primary" aria-hidden="true" />
                    <Typography sx={{ fontWeight: 800 }}>
                      {t(mode === 'completed'
                        ? 'refuge.journal.completed.verified'
                        : 'refuge.journal.outcomes.kinds.' + outcomeKind)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t(mode === 'completed'
                      ? 'refuge.journal.completed.at'
                      : 'refuge.journal.outcomes.at', { date: formatDate(date) })}
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
                  {item.rewardItemKey && (
                    <Chip data-testid="refuge-journal-verified-reward" size="small"
                      color="success" variant="outlined"
                      label={t('refuge.journal.completed.linkedReward', {
                        item: inventoryItemLabelKeys[item.rewardItemKey]
                          ? t('inventory.items.' + inventoryItemLabelKeys[item.rewardItemKey])
                          : t('refuge.journal.rewards.unknownItem'),
                      })}
                      sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': {
                        overflowWrap: 'anywhere', whiteSpace: 'normal', py: 0.75,
                      } }}
                    />
                  )}
                </Stack>
              </Stack>
            </Paper>
          );})}
        </Stack>
        {!loading && !error && hasMore && (
          <Button data-testid="refuge-journal-completed-more" variant="outlined"
            onClick={() => setPage(value => value + 1)} sx={{ alignSelf: 'flex-start' }}>
            {t(mode === 'completed'
              ? 'refuge.journal.completed.more'
              : 'refuge.journal.outcomes.more')}
          </Button>
        )}
        <Typography variant="caption" color="text.secondary"
          data-testid="refuge-journal-completed-disclaimer">
          {t(mode === 'completed'
            ? 'refuge.journal.completed.disclaimer'
            : 'refuge.journal.outcomes.disclaimer')}
        </Typography>
      </Stack>
    </Paper>
  );
}
