import { AutoAwesome, BackpackOutlined, ExploreOutlined, FavoriteBorder, HistoryEduOutlined, PersonOutlined, SportsEsportsOutlined } from '@mui/icons-material';
import { Alert, Button, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';
import { fetchCharacterHealth, type CharacterHealth, type CharacterHealthApiError } from '../features/health/characterHealthApi';
import { CharacterRestAction } from '../features/health/CharacterRestAction';
import { RefugePreparationBoard } from './RefugePreparationBoard';

const activities = [
  { key: 'character', to: '/character', icon: PersonOutlined, authenticated: false },
  { key: 'inventory', to: '/inventory', icon: BackpackOutlined, authenticated: true },
  { key: 'journal', to: '/refuge/journal', icon: HistoryEduOutlined, authenticated: true },
  { key: 'portals', to: '/portals', icon: AutoAwesome, authenticated: true },
  { key: 'training', to: '/refuge/training', icon: SportsEsportsOutlined, authenticated: false },
] as const;

export function RefugePage() {
  const { t } = useTranslation();
  const session = useStoredSession();
  // Key private health by the actual session token, so switching accounts can
  // never render the previous user's HP while the new request is pending.
  const [healthRecord, setHealthRecord] = useState<{
    token: string;
    status: 'loading' | 'ready' | 'notFound' | 'unavailable';
    health: CharacterHealth | null;
  } | null>(null);
  const [healthRetry, setHealthRetry] = useState(0);
  const currentRecord = session && healthRecord?.token === session.accessToken ? healthRecord : null;
  const health = currentRecord?.status === 'ready' ? currentRecord.health : null;
  const healthLoading = Boolean(session && (!currentRecord || currentRecord.status === 'loading'));
  const healthError = currentRecord?.status === 'notFound' ? 'notFound'
    : currentRecord?.status === 'unavailable' ? 'unavailable' : null;

  useEffect(() => {
    if (!session) {
      setHealthRecord(null);
      return;
    }

    const token = session.accessToken;
    const controller = new AbortController();
    setHealthRecord({ token, status: 'loading', health: null });
    void fetchCharacterHealth(token, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) {
          setHealthRecord({ token, status: 'ready', health: value });
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setHealthRecord({
            token,
            status: (error as CharacterHealthApiError).code === 'character_not_found'
              ? 'notFound' : 'unavailable',
            health: null,
          });
        }
      });
    return () => controller.abort();
  }, [session?.accessToken, healthRetry]);

  function reviewHealth() {
    const section = document.getElementById('refuge-health');
    section?.scrollIntoView({ behavior: 'auto', block: 'start' });
    section?.focus();
  }

  function refreshPreparation() {
    if (!session) return;
    // Unmount the previous equipment/encounter snapshot before reloading HP.
    // The new board then fetches the other owner-scoped read models as a unit.
    setHealthRecord({ token: session.accessToken, status: 'loading', health: null });
    setHealthRetry(value => value + 1);
  }

  return (
    <Stack spacing={3} data-testid="refuge-page">
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4, md: 5 } }}>
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="overline" color="primary.main">{t('refuge.eyebrow')}</Typography>
          <Typography component="h1" variant="h2">{t('refuge.title')}</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: '65ch' }}>{t('refuge.description')}</Typography>
          {session ? (
            <Typography data-testid="refuge-welcome" sx={{ fontWeight: 700 }}>
              {t('refuge.welcome', { name: session.user.displayName })}
            </Typography>
          ) : (
            <Alert severity="info" data-testid="refuge-guest">{t('refuge.guest')}</Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button data-testid="refuge-start-training" component={RouterLink} to="/refuge/training" variant="contained" startIcon={<SportsEsportsOutlined />}>
              {t('refuge.startTraining')}
            </Button>
            <Button data-testid="refuge-enter-world" component={RouterLink} to="/game" variant="outlined" startIcon={<ExploreOutlined />}>
              {t('refuge.enterWorld')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2} data-testid="refuge-activities">
        {activities.map(activity => {
          const Icon = activity.icon;
          return (
            <Grid key={activity.key} size={{ xs: 12, sm: 6, lg: 3 }}>
              <Paper variant="outlined" sx={{ height: '100%', p: { xs: 2.5, md: 3 } }}>
                <Stack spacing={1.5} sx={{ height: '100%', alignItems: 'flex-start' }}>
                  <Icon color="primary" fontSize="large" aria-hidden="true" />
                  <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    {t('refuge.cards.' + activity.key + '.title')}
                  </Typography>
                  <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
                    {t('refuge.cards.' + activity.key + '.description')}
                  </Typography>
                  <Chip size="small" variant="outlined" label={t(activity.authenticated ? 'refuge.requiresAccount' : 'refuge.availableWithoutAccount')} />
                  <Button data-testid={'refuge-activity-' + activity.key} component={RouterLink} to={activity.to}>
                    {t('refuge.open')}
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {session && (
        <Paper id="refuge-health" tabIndex={-1} data-testid="refuge-health" variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">{t('refuge.health.title')}</Typography>
            <Typography color="text.secondary">{t('refuge.health.description')}</Typography>
            {healthLoading && (
              <Stack direction="row" spacing={1.5} role="status" sx={{ alignItems: 'center' }}>
                <CircularProgress size={24} />
                <Typography>{t('refuge.health.loading')}</Typography>
              </Stack>
            )}
            {!healthLoading && healthError === 'notFound' && (
              <Alert data-testid="refuge-health-not-found" severity="info">
                {t('refuge.health.notFound')}{' '}
                <Button component={RouterLink} to="/character" size="small">{t('refuge.health.create')}</Button>
              </Alert>
            )}
            {!healthLoading && healthError === 'unavailable' && (
              <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <Alert severity="warning" data-testid="refuge-health-error">{t('refuge.health.unavailable')}</Alert>
                <Button data-testid="refuge-health-retry" variant="outlined"
                  onClick={() => setHealthRetry(value => value + 1)}>{t('refuge.health.retry')}</Button>
              </Stack>
            )}
            {!healthLoading && health && (
              <Stack spacing={1} data-testid="refuge-health-values">
                <Typography sx={{ fontWeight: 700 }} data-testid="refuge-health-count">
                  {t('refuge.health.value', { current: health.currentHealth, maximum: health.maxHealth })}
                </Typography>
                <LinearProgress variant="determinate" value={health.maxHealth > 0
                  ? (health.currentHealth / health.maxHealth) * 100 : 0}
                  aria-label={t('refuge.health.title')}
                  sx={{ height: 10, borderRadius: 2 }} />
                <Typography variant="caption" color="text.secondary">{t('refuge.health.baseMaxNote')}</Typography>
                <CharacterRestAction accessToken={session.accessToken} health={health}
                  onRested={result => setHealthRecord(current =>
                    current?.token === session.accessToken && current.health
                      ? { ...current, health: {
                        ...current.health,
                        currentHealth: result.currentHealth,
                        maxHealth: result.maxHealth,
                      } }
                      : current
                  )} />
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      {session && health && (
        <RefugePreparationBoard
          key={session.accessToken}
          accessToken={session.accessToken}
          health={health}
          onRefresh={refreshPreparation}
          onReviewHealth={reviewHealth}
        />
      )}

      <Paper data-testid="refuge-care" variant="outlined" sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
          <FavoriteBorder color="primary" fontSize="large" aria-hidden="true" />
          <Stack spacing={1} sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h2">{t('refuge.care.title')}</Typography>
            <Typography color="text.secondary">{t('refuge.care.description')}</Typography>
          </Stack>
          <Chip variant="outlined" label={t('refuge.care.planned')} />
        </Stack>
      </Paper>
    </Stack>
  );
}
