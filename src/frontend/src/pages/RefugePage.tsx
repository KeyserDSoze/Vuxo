import { AutoAwesome, BackpackOutlined, ExploreOutlined, FavoriteBorder, PersonOutlined, SportsEsportsOutlined, TouchAppOutlined, RouteOutlined, HistoryEduOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';
import { fetchCharacterHealth, type CharacterHealth, type CharacterHealthApiError } from '../features/health/characterHealthApi';
import { CharacterRestAction } from '../features/health/CharacterRestAction';
import { RefugePreparationBoard } from './RefugePreparationBoard';
import { RefugeActivityCatalog } from './RefugeActivityCatalog';

const activities = [
  { key: 'character', to: '/character', icon: PersonOutlined, authenticated: false },
  { key: 'inventory', to: '/inventory', icon: BackpackOutlined, authenticated: true },
  { key: 'journal', to: '/refuge/journal', icon: HistoryEduOutlined, authenticated: true },
  { key: 'portals', to: '/portals', icon: AutoAwesome, authenticated: true },
  { key: 'training', to: '/refuge/training', icon: SportsEsportsOutlined, authenticated: false },
  { key: 'reflex', to: '/refuge/reflex', icon: TouchAppOutlined, authenticated: false },
  { key: 'path', to: '/refuge/path', icon: RouteOutlined, authenticated: false },
] as const;

type RefugeFocusSection = 'activities' | 'health' | 'preparation' | 'care';

const refugeFocusIds: Record<RefugeFocusSection, string> = {
  activities: 'refuge-activities-section',
  health: 'refuge-health',
  preparation: 'refuge-preparation',
  care: 'refuge-care-section',
};

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
  // Presentation state only: panels stay mounted, preserving owner-scoped snapshots.
  const [focusSection, setFocusSection] = useState<RefugeFocusSection | null>(null);
  const focusMode = focusSection !== null;

  useEffect(() => {
    // Never preserve a previous owner's chosen panel across account changes.
    setFocusSection(null);
  }, [session?.accessToken]);

  useEffect(() => {
    if (!focusSection) return;
    // Keep the document stationary and reset only the GameDeck's content scroll.
    const deckScroll = document.querySelector<HTMLElement>('[data-testid="game-deck-scroll"]');
    if (deckScroll) deckScroll.scrollTop = 0;
    document.getElementById(refugeFocusIds[focusSection])?.focus({ preventScroll: true });
  }, [focusSection]);
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

  function openSection(sectionId: string) {
    if (focusMode) {
      const section = (Object.keys(refugeFocusIds) as RefugeFocusSection[])
        .find(key => refugeFocusIds[key] === sectionId);
      if (section) {
        setFocusSection(section);
        return;
      }
    }
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({ behavior: 'auto', block: 'start' });
    target?.focus({ preventScroll: true });
  }

  function reviewHealth() {
    openSection('refuge-health');
  }

  function refreshPreparation() {
    if (!session) return;
    // Unmount the previous equipment/encounter snapshot before reloading HP.
    // The new board then fetches the other owner-scoped read models as a unit.
    setHealthRecord({ token: session.accessToken, status: 'loading', health: null });
    setHealthRetry(value => value + 1);
  }

  return (
    <Stack spacing={2} data-testid="refuge-page" className="vuxo-refuge-dashboard">
      <Box component="nav" className="vuxo-refuge-sections" data-testid="refuge-section-nav"
        aria-label={t('refuge.dashboard.navigation')} sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
        <Button data-testid="refuge-focus-toggle" size="small"
          variant={focusMode ? 'contained' : 'outlined'}
          aria-pressed={focusMode}
          onClick={() => setFocusSection(current => current ? null : session ? 'health' : 'activities')}>
          {t(focusMode ? 'refuge.dashboard.fullView' : 'refuge.dashboard.focusView')}
        </Button>
        <Button data-testid="refuge-jump-activities" size="small"
          aria-pressed={focusMode ? focusSection === 'activities' : undefined}
          startIcon={<SportsEsportsOutlined />} onClick={() => openSection('refuge-activities-section')}>
          {t('refuge.dashboard.activities')}
        </Button>
        {session && (
          <Button data-testid="refuge-jump-health" size="small"
            aria-pressed={focusMode ? focusSection === 'health' : undefined}
            startIcon={<FavoriteBorder />} onClick={() => openSection('refuge-health')}>
            {t('refuge.dashboard.health')}
          </Button>
        )}
        {health && (
          <Button data-testid="refuge-jump-preparation" size="small"
            aria-pressed={focusMode ? focusSection === 'preparation' : undefined}
            startIcon={<BackpackOutlined />} onClick={() => openSection('refuge-preparation')}>
            {t('refuge.dashboard.preparation')}
          </Button>
        )}
        <Button data-testid="refuge-jump-care" size="small"
            aria-pressed={focusMode ? focusSection === 'care' : undefined}
          startIcon={<AutoAwesome />} onClick={() => openSection('refuge-care-section')}>
          {t('refuge.dashboard.care')}
        </Button>
      </Box>

      <Paper component="header" className="vuxo-refuge-hero" data-testid="refuge-command-hero"
        variant="outlined" sx={{ p: { xs: 1.5, sm: 2.25, md: 3 }, display: focusMode ? 'none' : undefined }}>
        <Box className="vuxo-refuge-hero__grid">
          <Stack spacing={1.2} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
            <Typography variant="overline" color="primary.main">{t('refuge.eyebrow')}</Typography>
            <Typography component="h1" variant="h2" className="vuxo-refuge-hero__title">{t('refuge.title')}</Typography>
            <Typography color="text.secondary" className="vuxo-refuge-hero__description">{t('refuge.description')}</Typography>
            {session ? (
              <Typography data-testid="refuge-welcome" sx={{ fontWeight: 700 }}>
                {t('refuge.welcome', { name: session.user.displayName })}
              </Typography>
            ) : (
              <Alert severity="info" data-testid="refuge-guest">{t('refuge.guest')}</Alert>
            )}
            <Stack className="vuxo-refuge-hero__actions" direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button data-testid="refuge-start-training" component={RouterLink} to="/refuge/training"
                variant="contained" startIcon={<SportsEsportsOutlined />}>
                {t('refuge.startTraining')}
              </Button>
              <Button data-testid="refuge-enter-world" component={RouterLink} to="/game"
                variant="outlined" startIcon={<ExploreOutlined />}>
                {t('refuge.enterWorld')}
              </Button>
            </Stack>
          </Stack>
          <Box component="aside" className="vuxo-refuge-hero__status" data-testid="refuge-command-status"
            sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 850 }}>
              {t('refuge.dashboard.status')}
            </Typography>
            {!session ? (
              <Typography variant="body2" color="text.secondary" data-testid="refuge-command-guest">
                {t('refuge.dashboard.statusGuest')}
              </Typography>
            ) : healthLoading ? (
              <Stack direction="row" role="status" sx={{ alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" data-testid="refuge-command-loading">
                  {t('refuge.dashboard.statusLoading')}
                </Typography>
              </Stack>
            ) : healthError ? (
              <Typography variant="body2" color={healthError === 'unavailable' ? 'warning.main' : 'text.secondary'}
                data-testid="refuge-command-unavailable">
                {t(healthError === 'notFound' ? 'refuge.dashboard.statusNotFound' : 'refuge.dashboard.statusUnavailable')}
              </Typography>
            ) : health ? (
              <Stack spacing={1} data-testid="refuge-command-health">
                <Typography variant="h4" sx={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {t('refuge.health.value', { current: health.currentHealth, maximum: health.maxHealth })}
                </Typography>
                <LinearProgress variant="determinate"
                  value={health.maxHealth > 0 ? Math.max(0, Math.min(100, (health.currentHealth / health.maxHealth) * 100)) : 0}
                  aria-label={t('refuge.health.title')} sx={{ height: 8, borderRadius: 4 }} />
                <Button size="small" variant="text" data-testid="refuge-command-review-health"
                  onClick={() => openSection('refuge-health')} sx={{ alignSelf: 'flex-start' }}>
                  {t('refuge.dashboard.healthReview')}
                </Button>
              </Stack>
            ) : null}
          </Box>
        </Box>
      </Paper>

      {session && (
        <Paper id="refuge-health" tabIndex={-1} data-testid="refuge-health" variant="outlined"
          sx={{ p: { xs: 2.5, sm: 3 }, display: focusMode && focusSection !== 'health' ? 'none' : undefined }}>
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
        <Box sx={{ display: focusMode && focusSection !== 'preparation' ? 'none' : undefined }}>
          <RefugePreparationBoard
            key={session.accessToken}
            accessToken={session.accessToken}
            health={health}
            onRefresh={refreshPreparation}
            onReviewHealth={reviewHealth}
          />
        </Box>
      )}

      <Box component="section" id="refuge-activities-section" tabIndex={-1}
        aria-labelledby="refuge-activities-title" data-testid="refuge-activities-section"
        sx={{ display: focusMode && focusSection !== 'activities' ? 'none' : undefined }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography id="refuge-activities-title" component="h2" variant="h5" sx={{ fontWeight: 850 }}>
              {t('refuge.dashboard.activities')}
            </Typography>
            <Typography variant="body2" color="text.secondary">{t('refuge.dashboard.activityHint')}</Typography>
          </Box>
      <Grid container spacing={1.5} data-testid="refuge-activities">
        {activities.map(activity => {
          const Icon = activity.icon;
          return (
            <Grid key={activity.key} size={{ xs: 12, sm: 6, md: 4, xl: 3 }}>
              <Paper variant="outlined" className="vuxo-refuge-activity" sx={{ height: '100%', p: { xs: 1.5, md: 2 } }}>
                <Stack spacing={1} sx={{ height: '100%', alignItems: 'flex-start' }}>
                  <Icon className="vuxo-refuge-activity__icon" color="primary" fontSize="large" aria-hidden="true" />
                  <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
                    {t('refuge.cards.' + activity.key + '.title')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {t('refuge.cards.' + activity.key + '.description')}
                  </Typography>
                  <Chip size="small" variant="outlined" label={t(activity.authenticated ? 'refuge.requiresAccount' : 'refuge.availableWithoutAccount')} />
                  <Button data-testid={'refuge-activity-' + activity.key} component={RouterLink} to={activity.to} variant="outlined" size="small">
                    {t('refuge.open')}
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <RefugeActivityCatalog />
        </Stack>
      </Box>

      <Paper id="refuge-care-section" tabIndex={-1} data-testid="refuge-care" variant="outlined"
        sx={{ p: { xs: 2.5, sm: 3 }, display: focusMode && focusSection !== 'care' ? 'none' : undefined }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
          <FavoriteBorder color="primary" fontSize="large" aria-hidden="true" />
          <Stack spacing={1} sx={{ flexGrow: 1 }}>
            <Typography id="refuge-care-title" variant="h6" component="h2">{t('refuge.care.title')}</Typography>
            <Typography color="text.secondary">{t('refuge.care.description')}</Typography>
          </Stack>
          <Chip variant="outlined" label={t('refuge.care.planned')} />
        </Stack>
      </Paper>
    </Stack>
  );
}
