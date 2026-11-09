import { AutoAwesome, Refresh } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Grid, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { getApiBaseUrl } from '../features/character/appearance';

type ActivityKey = 'rune-memory' | 'rune-reflex' | 'rune-path' | 'crafting';
type Activity = {
  key: ActivityKey;
  rulesVersion: string;
  kind: string;
  verification: 'local-practice';
  availability: 'available' | 'planned';
  practiceUnits: number;
  rewardsEnabled: false;
  progressionEnabled: false;
};
type Catalog = { catalogVersion: 'offworld-activities-v1'; activities: Activity[] };
type State = { phase: 'loading' | 'ready' | 'error'; catalog: Catalog | null };
const keys: readonly ActivityKey[] = ['rune-memory', 'rune-reflex', 'rune-path', 'crafting'];
const routes: Partial<Record<ActivityKey, string>> = {
  'rune-memory': '/refuge/training',
  'rune-reflex': '/refuge/reflex',
  'rune-path': '/refuge/path',
};

/**
 * Public read-only discovery. Never uses a user token, starts a game run or
 * treats a client response as authorization to give rewards or XP.
 */
function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.catalogVersion !== 'offworld-activities-v1' ||
      !Array.isArray(record.activities) || record.activities.length !== keys.length) return false;
  const entries = record.activities as unknown[];
  if (!entries.every(item => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    return keys.includes(entry.key as ActivityKey) &&
      typeof entry.rulesVersion === 'string' && entry.rulesVersion.length > 0 &&
      typeof entry.kind === 'string' &&
      entry.verification === 'local-practice' &&
      (entry.availability === 'available' || entry.availability === 'planned') &&
      Number.isInteger(entry.practiceUnits) && (entry.practiceUnits as number) >= 0 &&
      entry.rewardsEnabled === false && entry.progressionEnabled === false;
  })) return false;
  const found = entries.map(item => (item as Activity).key);
  return new Set(found).size === keys.length &&
    found.every(key => key === 'crafting' ||
      (record.activities as Activity[]).find(item => item.key === key)?.availability === 'available') &&
    (record.activities as Activity[]).find(item => item.key === 'crafting')?.availability === 'planned';
}

export function RefugeActivityCatalog() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setState({ phase: 'loading', catalog: null });
    void fetch(getApiBaseUrl() + '/api/activities/catalog', {
      signal: controller.signal, cache: 'no-store', method: 'GET',
    }).then(async response => {
      if (!response.ok) throw new Error('activity_catalog_unavailable');
      const data: unknown = await response.json();
      if (!isCatalog(data)) throw new Error('activity_catalog_invalid');
      return data;
    }).then(catalog => {
      if (!controller.signal.aborted) setState({ phase: 'ready', catalog });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ phase: 'error', catalog: null });
    });
    return () => controller.abort();
  }, [expanded, attempt]);

  return (
    <Paper component="section" variant="outlined" data-testid="refuge-catalog"
      aria-labelledby="refuge-catalog-heading" sx={{ p: { xs: 2.5, sm: 3.5 } }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography id="refuge-catalog-heading" component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              {t('refuge.catalog.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">{t('refuge.catalog.description')}</Typography>
          </Box>
          <Button data-testid="refuge-catalog-toggle" variant="outlined" startIcon={<AutoAwesome />}
            aria-expanded={expanded} aria-controls="refuge-catalog-results"
            sx={{ alignSelf: 'flex-start', flexShrink: 0 }}
            onClick={() => setExpanded(value => !value)}>
            {t(expanded ? 'refuge.catalog.hide' : 'refuge.catalog.show')}
          </Button>
        </Stack>
        <Collapse in={expanded} unmountOnExit>
          <Stack id="refuge-catalog-results" spacing={2}>
            <Alert severity="info" data-testid="refuge-catalog-policy">
              {t('refuge.catalog.policy')}
            </Alert>
            {(!state || state.phase === 'loading') && (
              <Stack direction="row" spacing={1.5} role="status" alignItems="center"
                data-testid="refuge-catalog-loading">
                <CircularProgress size={22} />
                <Typography>{t('refuge.catalog.loading')}</Typography>
              </Stack>
            )}
            {state?.phase === 'error' && (
              <Stack spacing={1.5} alignItems="flex-start">
                <Alert severity="warning" data-testid="refuge-catalog-error">
                  {t('refuge.catalog.unavailable')}
                </Alert>
                <Button data-testid="refuge-catalog-retry" variant="outlined"
                  startIcon={<Refresh />} onClick={() => setAttempt(value => value + 1)}>
                  {t('refuge.catalog.retry')}
                </Button>
              </Stack>
            )}
            {state?.phase === 'ready' && state.catalog && (
              <Grid container spacing={1.5} data-testid="refuge-catalog-list">
                {state.catalog.activities.map(activity => (
                  <Grid key={activity.key} size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Paper variant="outlined" data-testid={'refuge-catalog-' + activity.key}
                      sx={{ p: 2, height: '100%' }}>
                      <Stack spacing={1.25} alignItems="flex-start">
                        <Chip size="small" variant="outlined"
                          color={activity.availability === 'available' ? 'success' : 'default'}
                          label={t('refuge.catalog.status.' + activity.availability)} />
                        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
                          {t('refuge.catalog.activities.' + activity.key)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                          {t('refuge.catalog.rules', { version: activity.rulesVersion })}
                        </Typography>
                        {routes[activity.key] && activity.availability === 'available' && (
                          <Button component={RouterLink} to={routes[activity.key]}
                            data-testid={'refuge-catalog-play-' + activity.key} size="small">
                            {t('refuge.catalog.open')}
                          </Button>
                        )}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
