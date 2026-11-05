import { ArrowForward } from '@mui/icons-material';
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useAdminAccessState } from '../features/admin/useAdminAccessState';
import { useBuildInfo } from '../features/version/BuildInfoProvider';

const highlights = ['character', 'world', 'portals'] as const;

export function HomePage() {
  const { t } = useTranslation();
  const { build } = useBuildInfo();
  const signedIn = useAdminAccessState() !== 'unauthenticated';

  return (
    <Stack spacing={3}>
      <Paper data-testid="home-hero" elevation={0} sx={{
        minHeight: { xs: 'auto', md: 490 },
        p: { xs: 3, sm: 5, md: 7 },
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        border: 1,
        borderColor: 'divider',
        background: theme => 'radial-gradient(circle at 100% 0%, ' +
          alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.20 : 0.11) +
          ', transparent 60%), ' + theme.palette.background.paper
      }}>
        <Box aria-hidden="true" sx={{ position: 'absolute', width: { xs: 220, md: 440 }, height: { xs: 220, md: 440 }, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.06, filter: 'blur(18px)', right: { xs: -150, md: -180 }, top: -160, pointerEvents: 'none' }} />
        <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ maxWidth: 860, width: '100%', position: 'relative', minWidth: 0 }}>
          <Chip label={t('home.eyebrow', { version: build?.version ?? t('version.unknown') })} color="primary" variant="outlined" sx={{ alignSelf: 'flex-start', maxWidth: '100%' }} />
          <Typography component="h1" variant="h1" sx={{
            fontSize: { xs: 'clamp(2.35rem, 10vw, 3.5rem)', sm: '4.4rem', md: 'clamp(4.5rem, 6vw, 6rem)' },
            lineHeight: 1.06,
            maxWidth: '13ch',
            overflowWrap: 'break-word'
          }}>
            {t('home.title')}
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ maxWidth: '60ch', fontSize: { xs: '1.05rem', sm: '1.25rem' }, lineHeight: 1.6 }}>
            {t('home.description')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
            <Button component={RouterLink} to={signedIn ? '/game' : '/auth'} size="large" variant="contained" endIcon={<ArrowForward />}>
              {t(signedIn ? 'home.cta' : 'home.ctaSignIn')}
            </Button>
            <Button component={RouterLink} to="/character" size="large" variant="outlined">
              {t('home.ctaCharacter')}
            </Button>
            <Button data-testid="home-refuge-link" component={RouterLink} to="/refuge" size="large" variant="text">
              {t('home.ctaRefuge')}
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Grid container spacing={2} data-testid="home-highlights">
        {highlights.map((highlight, index) => (
          <Grid key={highlight} size={{ xs: 12, md: 4 }}>
            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
              <Stack spacing={1}>
                <Typography variant="overline" color="primary.main">{String(index + 1).padStart(2, '0')}</Typography>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>{t('home.features.' + highlight + '.title')}</Typography>
                <Typography color="text.secondary">{t('home.features.' + highlight + '.description')}</Typography>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
