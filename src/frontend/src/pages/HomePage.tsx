import { ArrowForward } from '@mui/icons-material';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useBuildInfo } from '../features/version/BuildInfoProvider';

export function HomePage() {
  const { t } = useTranslation();
  const { build } = useBuildInfo();

  return (
    <Paper elevation={0} sx={{ minHeight: { xs: '68vh', md: '72vh' }, p: { xs: 3, sm: 5, md: 8 }, display: 'grid', alignItems: 'center', overflow: 'hidden', position: 'relative', border: 1, borderColor: 'divider' }}>
      <Box sx={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.09, filter: 'blur(15px)', right: -140, top: -160 }} />
      <Stack spacing={3} sx={{ maxWidth: 860, position: 'relative' }}>
        <Chip label={t('home.eyebrow', { version: build?.version ?? t('version.unknown') })} color="primary" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
        <Typography component="h1" variant="h1" sx={{ fontSize: { xs: '3rem', sm: '4.8rem', md: '6.5rem' }, lineHeight: 0.94, maxWidth: 11 }}>
          {t('home.title')}
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 720, lineHeight: 1.5 }}>
          {t('home.description')}
        </Typography>
        <Box>
          <Button component={RouterLink} to="/game" size="large" variant="contained" endIcon={<ArrowForward />}>
            {t('home.cta')}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
