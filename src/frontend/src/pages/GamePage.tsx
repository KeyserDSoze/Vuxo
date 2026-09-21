import { Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { GameCanvas } from '../game/GameCanvas';

export function GamePage() {
  const { t } = useTranslation('game');

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h2" component="h1">{t('title')}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>{t('description')}</Typography>
      </div>
      <Paper variant="outlined" sx={{ p: { xs: 1, sm: 2 }, overflow: 'hidden' }}>
        <GameCanvas />
      </Paper>
    </Stack>
  );
}
