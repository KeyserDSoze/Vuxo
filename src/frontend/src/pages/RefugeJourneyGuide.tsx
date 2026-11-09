import { AutoAwesome, BackpackOutlined, FavoriteBorder, Refresh } from '@mui/icons-material';
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import type { CharacterHealth } from '../features/health/characterHealthApi';
import type { PortalEncounterStatus } from '../features/health/portalEncounterApi';
import type { EquipmentView } from '../features/inventory/equipmentApi';
import { deriveJourneySteps, type JourneyStepAction } from './refugeJourneyGuidance';

type Props = {
  health: CharacterHealth;
  equipment: EquipmentView | null;
  encounter: PortalEncounterStatus | null;
  onRefresh: () => void;
  onReviewHealth: () => void;
};

const actionRoutes: Record<Exclude<JourneyStepAction, 'refresh' | 'reviewHealth'>, string> = {
  character: '/character',
  training: '/refuge/training',
  inventory: '/inventory',
  portals: '/portals',
};

/**
 * An advisory route map for short off-world visits. It intentionally does not
 * decide game eligibility, produce rewards, or save a checklist.
 */
export function RefugeJourneyGuide({ health, equipment, encounter, onRefresh, onReviewHealth }: Props) {
  const { t } = useTranslation();
  const steps = deriveJourneySteps({ health, equipment, encounter });
  return (
    <Box component="section" aria-labelledby="refuge-journey-title" data-testid="refuge-journey">
      <Stack spacing={1.75}>
        <Box>
          <Typography component="h3" id="refuge-journey-title" variant="h6" sx={{ fontWeight: 800 }}>
            {t('refuge.journey.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('refuge.journey.description')}</Typography>
        </Box>
        <Grid container spacing={1.5}>
          {steps.map((step, index) => {
            const Icon = step.key === 'health' ? FavoriteBorder
              : step.key === 'equipment' ? BackpackOutlined : AutoAwesome;
            const statusColor = step.tone === 'positive' ? 'success'
              : step.tone === 'caution' ? 'warning' : 'default';
            const key = `refuge.journey.steps.${step.key}.${step.state}`;
            return (
              <Grid key={step.key} size={{ xs: 12, md: 4 }}>
                <Paper variant="outlined" data-testid={'refuge-journey-' + step.key}
                  data-state={step.state} sx={{ p: 2, height: '100%' }}>
                  <Stack spacing={1.25} sx={{ height: '100%', alignItems: 'flex-start' }}>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, width: '100%' }}>
                      <Icon fontSize="small" color="primary" aria-hidden="true" />
                      <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1, lineHeight: 1.5 }}>
                        {t('refuge.journey.step', { index: index + 1 })}
                      </Typography>
                      <Chip size="small" variant="outlined" color={statusColor}
                        label={t('refuge.journey.tone.' + step.tone)} />
                    </Stack>
                    <Typography component="h4" variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {t(key + '.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                      {t(key + '.description')}
                    </Typography>
                    {step.action === 'refresh' || step.action === 'reviewHealth' ? (
                      <Button
                        data-testid={'refuge-journey-action-' + step.key}
                        variant="text"
                        onClick={step.action === 'refresh' ? onRefresh : onReviewHealth}
                        startIcon={step.action === 'refresh' ? <Refresh fontSize="small" /> : undefined}
                      >
                        {t('refuge.journey.actions.' + step.action)}
                      </Button>
                    ) : (
                      <Button data-testid={'refuge-journey-action-' + step.key}
                        component={RouterLink} to={actionRoutes[step.action]} variant="text">
                        {t('refuge.journey.actions.' + step.action)}
                      </Button>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
        <Typography component="p" variant="caption" color="text.secondary" data-testid="refuge-journey-disclaimer">
          {t('refuge.journey.disclaimer')}
        </Typography>
      </Stack>
    </Box>
  );
}
