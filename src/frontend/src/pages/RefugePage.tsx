import { AutoAwesome, BackpackOutlined, ExploreOutlined, FavoriteBorder, PersonOutline, SportsEsportsOutlined } from '@mui/icons-material';
import { Alert, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';

const activities = [
  { key: 'character', to: '/character', icon: PersonOutline, authenticated: false },
  { key: 'inventory', to: '/inventory', icon: BackpackOutlined, authenticated: true },
  { key: 'portals', to: '/portals', icon: AutoAwesome, authenticated: true },
  { key: 'training', to: '/refuge/training', icon: SportsEsportsOutlined, authenticated: false },
] as const;

export function RefugePage() {
  const { t } = useTranslation();
  const session = useStoredSession();

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
