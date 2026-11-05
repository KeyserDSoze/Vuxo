import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';
import { HealingItemAction } from '../features/inventory/HealingItemAction';
import type { CharacterItemHealResult } from '../features/inventory/consumableApi';
import {
  equipInventoryItem, unequipInventoryItem, fetchInventoryStacks, fetchEquipment,
  EquipmentApiError, type InventoryStack, type EquipmentView,
} from '../features/inventory/equipmentApi';
import {
  fetchPlayerInventory,
  inventoryItemLabelKeys,
  InventoryApiError,
  type InventoryAward,
} from '../features/inventory/inventoryApi';

const statKeys = ['strength', 'dexterity', 'intelligence', 'constitution', 'luck', 'faith'] as const;

function slotFor(itemKey: string): 'relic' | 'charm' | null {
  if (itemKey === 'item.rune_shard.v1') return 'relic';
  if (itemKey === 'item.grove_seed.v1' || itemKey === 'item.tidal_pearl.v1') return 'charm';
  return null;
}

export function InventoryPage() {
  const { t, i18n } = useTranslation('inventory');
  const session = useStoredSession();
  const [items, setItems] = useState<InventoryAward[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [stacks, setStacks] = useState<InventoryStack[]>([]);
  const [loadout, setLoadout] = useState<EquipmentView | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentBusy, setEquipmentBusy] = useState(false);
  const [healingResult, setHealingResult] = useState<CharacterItemHealResult | null>(null);
  const [healingRefreshError, setHealingRefreshError] = useState(false);

  useEffect(() => {
    setItems([]);
    setStacks([]);
    setLoadout(null);
    setError(null);
    setEquipmentError(null);
    setHealingResult(null);
    setHealingRefreshError(false);
    setLoading(Boolean(session));
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void fetchPlayerInventory(controller.signal)
      .then(awards => { if (!controller.signal.aborted) setItems(awards); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(
          reason instanceof InventoryApiError ? reason.code : 'inventory_request_failed'
        );
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void Promise.all([
      fetchInventoryStacks(controller.signal),
      fetchEquipment(controller.signal),
    ]).then(([stackData, equipmentData]) => {
      if (controller.signal.aborted) return;
      setStacks(stackData);
      setLoadout(equipmentData);
    }).catch(reason => {
      if (!controller.signal.aborted) setEquipmentError(
        reason instanceof EquipmentApiError ? reason.code : 'inventory_request_failed'
      );
    });
    return () => controller.abort();
  }, [session?.accessToken]);

  const performEquipmentAction = async (action: () => Promise<EquipmentView>) => {
    if (equipmentBusy) return;
    setEquipmentBusy(true);
    setEquipmentError(null);
    try {
      const result = await action();
      setLoadout(result);
      setStacks(await fetchInventoryStacks());
    } catch (reason) {
      setEquipmentError(reason instanceof EquipmentApiError
        ? reason.code : 'inventory_request_failed');
    } finally {
      setEquipmentBusy(false);
    }
  };

  return (
    <Stack spacing={3} data-testid="inventory-page">
      <Box>
        <Typography variant="h2" component="h1">{t('title')}</Typography>
        <Typography color="text.secondary">{t('description')}</Typography>
      </Box>

      {!session && (
        <Alert severity="info" data-testid="inventory-auth-required">
          {t('authenticationRequired')}{' '}
          <Button component={RouterLink} to="/auth" size="small">{t('signIn')}</Button>
        </Alert>
      )}

      {loading && <CircularProgress aria-label={t('loading')} />}
      {error && (
        <Alert severity="error" data-testid="inventory-error">
          {t('errors.' + error, { defaultValue: t('errors.inventory_request_failed') })}
        </Alert>
      )}
      {session && !loading && !error && items.length === 0 && (
        <Alert severity="info" data-testid="inventory-empty">{t('empty')}</Alert>
      )}

      {equipmentError && (
        <Alert severity="warning" data-testid="equipment-error">
          {t('errors.' + equipmentError, { defaultValue: t('errors.inventory_request_failed') })}
        </Alert>
      )}
      {healingResult && (
        <Alert data-testid="inventory-heal-success" severity="success">
          {t('healing.success', {
            restored: healingResult.restoredHealth,
            current: healingResult.currentHealth,
            maximum: healingResult.maxHealth,
          })}{' '}
          <Button component={RouterLink} to="/refuge" size="small">{t('healing.refuge')}</Button>
        </Alert>
      )}
      {healingRefreshError && (
        <Alert data-testid="inventory-heal-refresh-error" severity="warning">
          {t('healing.refreshError')}
        </Alert>
      )}
      {stacks.length > 0 && (
        <Stack spacing={1.5} data-testid="inventory-stacks">
          <Typography variant="h5">{t('stacksTitle')}</Typography>
          {stacks.map(stack => {
            const labelKey = inventoryItemLabelKeys[stack.itemKey];
            const slot = slotFor(stack.itemKey);
            const active = loadout?.items.find(item => item.itemKey === stack.itemKey);
            const occupied = Boolean(slot && loadout?.items.some(item => item.slot === slot));
            return (
              <Paper key={stack.itemKey} variant="outlined"
                sx={{ p: { xs: 2, md: 3 } }} data-testid="inventory-stack">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                  <Stack spacing={0.5}>
                    <Typography variant="h6">{labelKey ? t('items.' + labelKey) : stack.itemKey}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('stackQuantity', { count: stack.quantity })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('equippedQuantity', { count: stack.equippedQuantity })}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {active && slot ? (
                      <Button data-testid="inventory-unequip" variant="outlined"
                        disabled={equipmentBusy}
                        onClick={() => void performEquipmentAction(() => unequipInventoryItem(slot))}>
                        {t('unequip')}
                      </Button>
                    ) : slot && stack.availableGrantIds.length > 0 ? (
                      <Button data-testid="inventory-equip" variant="contained"
                        disabled={equipmentBusy || occupied}
                        onClick={() => void performEquipmentAction(
                          () => equipInventoryItem(stack.availableGrantIds[0])
                        )}>
                        {t('equip')}
                      </Button>
                    ) : null}
                    {stack.itemKey === 'item.grove_seed.v1' && stack.availableGrantIds.length > 0 && (
                      <HealingItemAction key={stack.availableGrantIds[0]}
                        grantId={stack.availableGrantIds[0]}
                        disabled={equipmentBusy}
                        onHealed={result => {
                          setHealingResult(result);
                          setHealingRefreshError(false);
                          void fetchInventoryStacks().then(setStacks).catch(() => {
                            setHealingRefreshError(true);
                          });
                        }} />
                    )}
                    {slot && <Chip size="small" label={t('slots.' + slot)} />}
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {loadout?.stats && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="equipment-stats">
          <Stack spacing={1}>
            <Typography variant="h5">{t('effectiveStats')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('statsPreviewNote')}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {statKeys.map(stat => (
                <Chip key={stat} variant="outlined" label={
                  t('stats.' + stat, {
                    value: loadout.stats![stat],
                    bonus: loadout.stats!.bonuses[stat],
                  })
                } />
              ))}
            </Box>
            <Typography variant="body2">{t('maxHealth', { value: loadout.stats.maxHealth })}</Typography>
          </Stack>
        </Paper>
      )}

      {items.length > 0 && (
        <Stack spacing={1.5} data-testid="inventory-items">
          <Typography variant="h5">{t('owned', { count: items.length })}</Typography>
          {items.map(award => {
            const labelKey = inventoryItemLabelKeys[award.itemKey];
            return (
              <Paper key={award.grantId} variant="outlined" sx={{ p: { xs: 2, md: 3 } }}
                data-testid="inventory-item">
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                  <Stack>
                    <Typography variant="h6" component="h2">
                      {labelKey ? t('items.' + labelKey) : award.itemKey}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('awardedAt', {
                        date: new Date(award.awardedAtUtc).toLocaleString(
                          i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'it-IT'
                        )
                      })}
                    </Typography>
                  </Stack>
                  <Chip color="primary" variant="outlined"
                    label={t('quantity', { count: award.quantity })} />
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
