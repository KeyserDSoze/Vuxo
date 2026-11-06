import { AutoAwesome, BackpackOutlined, Refresh } from '@mui/icons-material';
import { Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { EquipmentView } from './equipmentApi';
import { inventoryItemLabelKeys } from './inventoryApi';

type Slot = 'relic' | 'charm';

type Props = {
  loadout: EquipmentView;
  busy: boolean;
  onUnequip: (slot: Slot) => void;
  onFind: (slot: Slot) => void;
  onRefresh: () => void;
};

/** Owner-only API read model. The browser displays slots; it never grants or swaps items. */
export function InventoryLoadoutPanel({ loadout, busy, onUnequip, onFind, onRefresh }: Props) {
  const { t } = useTranslation('translation', { keyPrefix: 'inventory' });
  return (
    <Paper component="section" aria-labelledby="inventory-loadout-title"
      data-testid="inventory-loadout" variant="outlined"
      sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{
          gap: 1, justifyContent: 'space-between', alignItems: { sm: 'center' },
        }}>
          <Box>
            <Typography component="h2" variant="h5" id="inventory-loadout-title"
              sx={{ fontWeight: 800 }}>{t('loadout.title')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('loadout.description')}</Typography>
          </Box>
          <Button variant="outlined" data-testid="inventory-loadout-refresh"
            startIcon={<Refresh />} disabled={busy} onClick={onRefresh}
            sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
            {t('loadout.refresh')}
          </Button>
        </Stack>
        <Grid container spacing={2}>
          {(['relic', 'charm'] as const).map(slot => {
            const item = loadout.items.find(value => value.slot === slot);
            const labelKey = item && inventoryItemLabelKeys[item.itemKey];
            const label = item ? labelKey ? t('items.' + labelKey) : t('loadout.unknownItem') : t('loadout.empty');
            const Icon = slot === 'relic' ? AutoAwesome : BackpackOutlined;
            return (
              <Grid key={slot} size={{ xs: 12, sm: 6 }}>
                <Paper variant="outlined" data-testid={'inventory-loadout-slot-' + slot}
                  sx={{ height: '100%', p: 2.5, bgcolor: 'background.default' }}>
                  <Stack spacing={1.5} sx={{ height: '100%', alignItems: 'flex-start' }}>
                    <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                      <Icon color="primary" aria-hidden="true" />
                      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 750 }}>
                        {t('slots.' + slot)}
                      </Typography>
                    </Stack>
                    <Typography data-testid={'inventory-loadout-item-' + slot}
                      sx={{ fontWeight: item ? 800 : 500, overflowWrap: 'anywhere' }}>
                      {label}
                    </Typography>
                    <Chip size="small" variant="outlined"
                      label={t(item ? 'loadout.equipped' : 'loadout.slotEmpty')} />
                    {item && (
                      <Typography variant="body2" color="text.secondary">
                        {t('loadout.replaceHint')}
                      </Typography>
                    )}
                    {item?.itemKey === 'item.grove_seed.v1' && (
                      <Typography data-testid="inventory-loadout-healing-note"
                        variant="body2" color="text.secondary">
                        {t('loadout.healingNote')}
                      </Typography>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, width: '100%' }}>
                      {item && (
                        <Button variant="outlined" disabled={busy}
                          data-testid={'inventory-loadout-unequip-' + slot}
                          onClick={() => onUnequip(slot)}>
                          {busy ? <CircularProgress size={19} color="inherit" /> : t('loadout.unequip')}
                        </Button>
                      )}
                      <Button data-testid={'inventory-loadout-find-' + slot}
                        disabled={busy} onClick={() => onFind(slot)}>
                        {t('loadout.find')}
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
        <Typography variant="caption" color="text.secondary">{t('loadout.serverNote')}</Typography>
      </Stack>
    </Paper>
  );
}
