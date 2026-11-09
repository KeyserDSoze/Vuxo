import { Box } from '@mui/material';
import { GameCanvas } from '../game/GameCanvas';

export function GamePage() {
  return (
    <Box data-testid="game-page" sx={{ flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <GameCanvas />
    </Box>
  );
}
