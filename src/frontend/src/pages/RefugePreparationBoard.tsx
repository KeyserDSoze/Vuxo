import { AutoAwesome, BackpackOutlined, ExploreOutlined, FavoriteBorder, Refresh } from '@mui/icons-material';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import type { CharacterHealth } from '../features/health/characterHealthApi';
import { fetchPortalEncounterStatus, type PortalEncounterStatus } from '../features/health/portalEncounterApi';
import { fetchEquipment, type EquipmentView } from '../features/inventory/equipmentApi';
import { inventoryItemLabelKeys } from '../features/inventory/inventoryApi';
import { RefugeJourneyGuide } from './RefugeJourneyGuide';

type ReadinessSnapshot = {
  equipment: EquipmentView | null;
  encounter: PortalEncounterStatus | null;
  equipmentFailed: boolean;
  encounterFailed: boolean;
};

type Props = {
  accessToken: string;
  health: CharacterHealth;
  onRefresh: () => void;
  onReviewHealth: () => void;
};

const slots = ['relic', 'charm'] as const;

/**
 * Read-only preparation snapshot; never decides combat eligibility, rewards or
 * cooldown. All three models originate from the authenticated owner APIs.
 */
export function RefugePreparationBoard({ accessToken, health, onRefresh, onReviewHealth }: Props) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    void Promise.allSettled([
      fetchEquipment(controller.signal),
      fetchPortalEncounterStatus(accessToken, controller.signal),
    ]).then(([equipmentResult, encounterResult]) => {
      if (controller.signal.aborted) return;
      setSnapshot({
        equipment: equipmentResult.status === 'fulfilled' ? equipmentResult.value : null,
        encounter: encounterResult.status === 'fulfilled' ? encounterResult.value : null,
        equipmentFailed: equipmentResult.status === 'rejected',
        encounterFailed: encounterResult.status === 'rejected',
      });
    });
    return () => controller.abort();
  }, [accessToken]);

  const hpState = health.currentHealth === 0 ? 'down' :
    health.currentHealth < health.maxHealth ? 'incomplete' : 'full';

  function equippedLabel(slot: typeof slots[number]) {
    const item = snapshot?.equipment?.items.find(value => value.slot === slot);
    if (!item) return t('refuge.preparation.empty');
    const labelKey = inventoryItemLabelKeys[item.itemKey];
    return labelKey ? t('inventory.items.' + labelKey) : t('refuge.preparation.unknownItem');
  }

  return (
    <Paper component="section" variant="outlined" aria-labelledby="refuge-preparation-title"
      data-testid="refuge-preparation" sx={{ p: { xs: 2.5, sm: 3.5 } }}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 1.5, alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography id="refuge-preparation-title" component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              {t('refuge.preparation.title')}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {t('refuge.preparation.description')}
            </Typography>
          </Box>
          <Button data-testid="refuge-preparation-refresh" startIcon={<Refresh />}
            variant="outlined" onClick={onRefresh} sx={{ flexShrink: 0, alignSelf: 'flex-start' }}>
            {t('refuge.preparation.refresh')}
          </Button>
        </Stack>

        {!snapshot ? (
          <Stack direction="row" spacing={1.5} role="status" sx={{ alignItems: 'center' }}
            data-testid="refuge-preparation-loading">
            <CircularProgress size={22} />
            <Typography>{t('refuge.preparation.loading')}</Typography>
          </Stack>
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }} data-testid="refuge-preparation-hp">
                <Stack spacing={1}>
                  <FavoriteBorder color="primary" aria-hidden="true" />
                  <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
                    {t('refuge.preparation.health')}
                  </Typography>
                  <Typography data-testid="refuge-preparation-hp-count" variant="h5" sx={{ fontWeight: 800 }}>
                    {t('refuge.health.value', { current: health.currentHealth, maximum: health.maxHealth })}
                  </Typography>
                  <Typography variant="body2" color={hpState === 'down' ? 'error.main' : 'text.secondary'}
                    data-testid="refuge-preparation-hp-state">
                    {t('refuge.preparation.hp.' + hpState)}
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }} data-testid="refuge-preparation-equipment">
                <Stack spacing={1}>
                  <BackpackOutlined color="primary" aria-hidden="true" />
                  <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
                    {t('refuge.preparation.equipment')}
                  </Typography>
                  {snapshot.equipmentFailed || !snapshot.equipment ? (
                    <Alert data-testid="refuge-preparation-equipment-error" severity="warning">
                      {t('refuge.preparation.equipmentUnavailable')}
                    </Alert>
                  ) : (
                    slots.map(slot => (
                      <Stack key={slot} spacing={0} data-testid={'refuge-preparation-slot-' + slot}>
                        <Typography variant="caption" color="text.secondary">
                          {t('refuge.preparation.slots.' + slot)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                          {equippedLabel(slot)}
                        </Typography>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }} data-testid="refuge-preparation-encounter">
                <Stack spacing={1}>
                  <AutoAwesome color="primary" aria-hidden="true" />
                  <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
                    {t('refuge.preparation.encounter')}
                  </Typography>
                  {snapshot.encounterFailed || !snapshot.encounter ? (
                    <Alert data-testid="refuge-preparation-encounter-error" severity="warning">
                      {t('refuge.preparation.encounterUnavailable')}
                    </Alert>
                  ) : snapshot.encounter.active ? (
                    <Alert data-testid="refuge-preparation-encounter-active" severity="warning">
                      {t('refuge.preparation.encounterActive')}
                    </Alert>
                  ) : (
                    <Typography data-testid="refuge-preparation-encounter-idle" variant="body2">
                      {t('refuge.preparation.encounterIdle')}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        )}

        {snapshot && (
          <RefugeJourneyGuide health={health} equipment={snapshot.equipment}
            encounter={snapshot.encounter} onRefresh={onRefresh}
            onReviewHealth={onReviewHealth} />
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Button data-testid="refuge-preparation-inventory" component={RouterLink} to="/inventory"
            variant="contained" startIcon={<BackpackOutlined />}>
            {t('refuge.preparation.openInventory')}
          </Button>
          <Button data-testid="refuge-preparation-portals" component={RouterLink} to="/portals"
            variant="outlined" startIcon={<AutoAwesome />}>
            {t('refuge.preparation.openPortals')}
          </Button>
          <Button data-testid="refuge-preparation-game" component={RouterLink} to="/game"
            variant="text" startIcon={<ExploreOutlined />}>
            {t('refuge.preparation.openWorld')}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
