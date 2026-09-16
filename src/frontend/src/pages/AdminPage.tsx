import { Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function AdminPage() {
  const { t } = useTranslation();

  return (
    <Stack spacing={3}>
      <Typography variant="h2" component="h1">{t('admin.title')}</Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">{t('admin.description')}</Typography>
      </Paper>
    </Stack>
  );
}
