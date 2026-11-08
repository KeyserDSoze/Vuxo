import { Box, ButtonBase, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AdventureMetricKey } from './journalAdventureNavigation';
import {
  summarizeRefugeAdventure, type AdventureHistorySnapshot,
} from './refugeAdventureOverview';

type MetricKey = AdventureMetricKey;

const metrics: readonly MetricKey[] = [
  'inventoryRecords', 'availablePortals', 'runeCompletions',
  'firstMistakes', 'guardianVictories', 'guardianRetreats', 'linkedRewards',
];

/**
 * Player-facing, read-only summary of confirmed owner data. A missing or
 * failed read stays unavailable, not zero. No new API fetch or gameplay state.
 */
export function RefugeAdventureOverview({
  inventory, portals, history, onNavigate,
}: {
  inventory: readonly unknown[] | null;
  portals: readonly unknown[] | null;
  history: AdventureHistorySnapshot | null;
  onNavigate: (metric: AdventureMetricKey) => void;
}) {
  const { t } = useTranslation();
  const overview = summarizeRefugeAdventure(inventory, portals, history);
  return (
    <Paper component="section" variant="outlined" data-testid="refuge-journal-overview"
      aria-labelledby="refuge-journal-overview-title"
      sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack spacing={0.75}>
          <Typography id="refuge-journal-overview-title" component="h2" variant="h5"
            sx={{ fontWeight: 800 }}>
            {t('refuge.journal.overview.title')}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {t('refuge.journal.overview.description')}
          </Typography>
        </Stack>
        <Box sx={{ display: 'grid', gap: 1.5,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
          {metrics.map(key => {
            const count = overview[key];
            return (
              <ButtonBase key={key} data-testid={'refuge-journal-overview-' + key}
                data-status={count === null ? 'unavailable' : 'verified'}
                onClick={() => onNavigate(key)}
                aria-label={t('refuge.journal.overview.openMetric', {
                  metric: t('refuge.journal.overview.metrics.' + key),
                })}
                sx={{ p: 1.75, border: 1, borderColor: 'divider', borderRadius: 2,
                  minWidth: 0, bgcolor: 'background.default', width: '100%',
                  display: 'flex', justifyContent: 'flex-start', textAlign: 'left',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  '&:focus-visible': { outline: '3px solid', outlineOffset: 2,
                    outlineColor: 'primary.main' } }}>
                <Stack spacing={0.5}>
                  <Typography variant={count === null ? 'subtitle2' : 'h4'}
                    sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {count === null ? t('refuge.journal.overview.unavailable') : count}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('refuge.journal.overview.metrics.' + key)}
                  </Typography>
                  <Typography variant="caption" color="primary.main">
                    {t('refuge.journal.overview.openDetails')}
                  </Typography>
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>
        <Typography variant="caption" color="text.secondary"
          data-testid="refuge-journal-overview-scope">
          {overview.historyMode === null
            ? t('refuge.journal.overview.historyUnavailable')
            : t('refuge.journal.overview.scope.' + overview.historyMode,
              { loaded: overview.loadedEvents })}
          {overview.hasMoreEvents === true
            ? ' ' + t('refuge.journal.overview.moreAvailable') : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('refuge.journal.overview.disclaimer')}
        </Typography>
      </Stack>
    </Paper>
  );
}
