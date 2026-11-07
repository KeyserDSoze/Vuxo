import { Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { GameCanvas } from '../game/GameCanvas';
import { useStoredSession } from '../features/auth/useStoredSession';

export function GamePage() {
  const session = useStoredSession();
  // A Phaser world connection and its in-progress portal encounters are
  // private to one session, not reusable when a different account logs in.
  return <SessionGamePage key={session?.accessToken ?? 'guest'} />;
}

function SessionGamePage() {
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
