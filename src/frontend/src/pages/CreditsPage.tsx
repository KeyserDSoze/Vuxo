import { FavoriteBorderOutlined } from '@mui/icons-material';
import { Link, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DeckPageHeader } from '../components/DeckPageHeader';
import { creditEntries, licenseUrls } from '../features/credits/creditsData';

export function CreditsPage() {
  const { t } = useTranslation();

  return (
    <Stack spacing={3} data-testid="credits-page">
      <DeckPageHeader
        icon={FavoriteBorderOutlined}
        eyebrow={t('credits.eyebrow')}
        title={t('credits.title')}
        description={t('credits.description')}
      />
      <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {creditEntries.map(entry => (
          <Paper key={entry.id} component="li" variant="outlined" data-testid={`credit-${entry.id}`} sx={{ p: 2 }}>
            <Typography variant="h6" component="h2">{entry.pack}</Typography>
            <Typography color="text.secondary">{t('credits.by', { author: entry.author })}</Typography>
            <Typography sx={{ mt: 1 }}>{t(`credits.entries.${entry.usageKey}`)}</Typography>
            <Stack direction="row" spacing={2} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
              <Link href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">{t('credits.source')}</Link>
              <Link href={licenseUrls[entry.license]} target="_blank" rel="noopener noreferrer">{t('credits.license', { license: entry.license })}</Link>
            </Stack>
          </Paper>
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary">{t('credits.original')}</Typography>
    </Stack>
  );
}
