import { Alert, Box, Button, Chip, CircularProgress, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';
import { useOwnerFocusRefresh } from '../features/auth/useOwnerFocusRefresh';
import { readForCurrentOwner } from '../features/auth/ownerReadFence';
import { readStoredSession, type VuxoSession } from '../features/auth/authSession';
import { createOwnerActionGate, type OwnerActionGate } from '../features/inventory/ownerActionGate';
import { browseInventory, equipmentSlotFor, type InventoryBrowseFilter, type InventoryBrowseSlot, type InventoryBrowseSort } from '../features/inventory/inventoryBrowse';
import { InventoryLoadoutPanel } from '../features/inventory/InventoryLoadoutPanel';
import { readConsistentEquipmentSnapshot } from '../features/inventory/inventorySnapshotConsistency';
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
type ActionLease = { gate: OwnerActionGate; ticket: number };

/** Reset all owner data and browse state immediately when the authenticated account changes. */
export function InventoryPage() {
  const session = useStoredSession();
  return <InventorySessionPage key={session?.accessToken ?? 'guest'} session={session} />;
}

function InventorySessionPage({ session }: { session: VuxoSession | null }) {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'inventory' });
  const [items, setItems] = useState<InventoryAward[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const [stacks, setStacks] = useState<InventoryStack[]>([]);
  const [loadout, setLoadout] = useState<EquipmentView | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentBusy, setEquipmentBusy] = useState(false);
  const [equipmentLoading, setEquipmentLoading] = useState(Boolean(session));
  const [equipmentRevision, setEquipmentRevision] = useState(0);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [healingResult, setHealingResult] = useState<CharacterItemHealResult | null>(null);
  const [healingRefreshError, setHealingRefreshError] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseFilter, setBrowseFilter] = useState<InventoryBrowseFilter>('all');
  const [browseSlot, setBrowseSlot] = useState<InventoryBrowseSlot>('all');
  const [browseSort, setBrowseSort] = useState<InventoryBrowseSort>('name');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ownerGate = useRef<OwnerActionGate | null>(null);
  const mutationControllers = useRef(new Set<AbortController>());
  const healingLease = useRef<ActionLease | null>(null);

  // A keyed owner view owns exactly one mutation lane. StrictMode may rehearse
  // effects: recreate the gate on every setup and invalidate previous tickets.
  useEffect(() => {
    const gate = createOwnerActionGate(session?.accessToken ?? null);
    ownerGate.current = gate;
    return () => {
      gate.dispose();
      for (const controller of mutationControllers.current) controller.abort();
      mutationControllers.current.clear();
      if (ownerGate.current === gate) ownerGate.current = null;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    setItems([]);
    setStacks([]);
    setLoadout(null);
    setError(null);
    setEquipmentError(null);
    setEquipmentLoading(Boolean(session));
    setHealingResult(null);
    setHealingRefreshError(false);
    setLoading(Boolean(session));
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void readForCurrentOwner(session.accessToken, () => fetchPlayerInventory(controller.signal), controller.signal)
      .then(awards => { if (!controller.signal.aborted) setItems(awards); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(
          reason instanceof InventoryApiError ? reason.code : 'inventory_request_failed'
        );
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session?.accessToken, inventoryRevision]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setEquipmentLoading(true);
    setEquipmentError(null);
    // Hide the previous snapshot until both owner-scoped reads succeed.
    setLoadout(null);
    setStacks([]);
    void readForCurrentOwner(session.accessToken, () => readConsistentEquipmentSnapshot(
      () => readForCurrentOwner(session.accessToken, () => Promise.all([
        fetchInventoryStacks(controller.signal),
        fetchEquipment(controller.signal),
      ]), controller.signal),
      controller.signal,
    ), controller.signal).then(snapshot => {
      if (controller.signal.aborted) return;
      setStacks(snapshot.stacks);
      setLoadout(snapshot.equipment);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setEquipmentError(reason instanceof EquipmentApiError
        ? reason.code : 'inventory_request_failed');
    }).finally(() => {
      if (!controller.signal.aborted) setEquipmentLoading(false);
    });
    return () => controller.abort();
  }, [session?.accessToken, equipmentRevision]);

  // Clear the warning only once all three authoritative read models are back.
  useEffect(() => {
    if (healingRefreshError && !loading && !equipmentLoading &&
        !error && !equipmentError && loadout) {
      setHealingRefreshError(false);
    }
  }, [healingRefreshError, loading, equipmentLoading, error, equipmentError, loadout]);

  const browseReady = Boolean(session && !loading && !error && !equipmentLoading && !equipmentError && loadout);
  const canBrowse = browseReady && (stacks.length > 0 || items.length > 0);
  const view = useMemo(() => loadout
    ? browseInventory({
        stacks, awards: items, loadout, query: browseQuery, filter: browseFilter, slot: browseSlot,
        sort: browseSort, locale: i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it',
        itemLabel: itemKey => {
          const key = inventoryItemLabelKeys[itemKey];
          return key ? t('items.' + key) : itemKey;
        },
      })
    : { stacks, awards: items },
  [stacks, items, loadout, browseQuery, browseFilter, browseSlot, browseSort, i18n.resolvedLanguage, t]);
  const displayedStacks = browseReady ? view.stacks : [];
  const displayedItems = browseReady ? view.awards : items;
  const noMatches = canBrowse && displayedStacks.length === 0 && displayedItems.length === 0;

  const isCurrentAction = ({ gate, ticket }: ActionLease) =>
    ownerGate.current === gate &&
    gate.isCurrent(ticket, readStoredSession()?.accessToken ?? null);

  const beginOwnerAction = (): ActionLease | null => {
    if (!browseReady || !session || equipmentBusy) return null;
    const gate = ownerGate.current;
    const ticket = gate?.acquire(readStoredSession()?.accessToken ?? null);
    if (!gate || ticket == null) return null;
    setEquipmentBusy(true); // disables all equip and healing buttons
    return { gate, ticket };
  };

  const finishOwnerAction = (lease: ActionLease) => {
    const stillCurrent = isCurrentAction(lease);
    lease.gate.release(lease.ticket);
    if (stillCurrent) setEquipmentBusy(false);
  };

  const beginHealing = () => {
    const lease = beginOwnerAction();
    if (!lease) return false;
    healingLease.current = lease;
    return true;
  };

  const finishHealing = () => {
    const lease = healingLease.current;
    healingLease.current = null;
    if (lease) finishOwnerAction(lease);
  };

  const refreshAfterHealing = async (result: CharacterItemHealResult) => {
    const lease = healingLease.current;
    if (!lease || !isCurrentAction(lease) || !session) return;
    // The server committed the heal. Until all three reads complete, hide
    // available grants *and* equipment to prevent duplicate spending.
    setHealingResult(result);
    setHealingRefreshError(false);
    setLoading(true);
    setEquipmentLoading(true);
    setItems([]);
    setStacks([]);
    setLoadout(null);
    setError(null);
    setEquipmentError(null);

    const controller = new AbortController();
    mutationControllers.current.add(controller);
    try {
      const [awards, snapshot] = await readForCurrentOwner(session.accessToken, () => Promise.all([
        fetchPlayerInventory(controller.signal),
        readConsistentEquipmentSnapshot(
          () => readForCurrentOwner(session.accessToken, () => Promise.all([
            fetchInventoryStacks(controller.signal),
            fetchEquipment(controller.signal),
          ]), controller.signal),
          controller.signal,
        ),
      ]), controller.signal);
      if (!isCurrentAction(lease) || controller.signal.aborted) return;
      setItems(awards);
      setStacks(snapshot.stacks);
      setLoadout(snapshot.equipment);
    } catch {
      if (!isCurrentAction(lease) || controller.signal.aborted) return;
      // Never restore an old stock snapshot after a committed heal.
      setHealingRefreshError(true);
      setEquipmentError('inventory_request_failed');
    } finally {
      mutationControllers.current.delete(controller);
      if (isCurrentAction(lease) && !controller.signal.aborted) {
        setLoading(false);
        setEquipmentLoading(false);
      }
    }
  };

  const resetBrowse = () => {
    setBrowseQuery('');
    setBrowseFilter('all');
    setBrowseSlot('all');
    setBrowseSort('name');
  };

  const showAvailableSlot = (slot: Exclude<InventoryBrowseSlot, 'all'>) => {
    if (!browseReady) return;
    setBrowseFilter('available');
    setBrowseSlot(slot);
    setBrowseQuery('');
    searchRef.current?.focus();
  };

  const refreshEquipment = () => {
    if (equipmentBusy || equipmentLoading ||
        !session || readStoredSession()?.accessToken !== session.accessToken) return;
    // Synchronously hide the old snapshot when the user requests fresh data.
    setEquipmentLoading(true);
    setLoadout(null);
    setStacks([]);
    setItems([]);
    setLoading(true);
    setError(null);
    setInventoryRevision(value => value + 1);
    setEquipmentRevision(value => value + 1);
  };

  // Revalidate the owner snapshot when returning from the game or another
  // device. Skip requests during healing/equipment writes and pending reads.
  useOwnerFocusRefresh(
    session?.accessToken ?? null,
    refreshEquipment,
    () => !loading && !equipmentLoading && !equipmentBusy,
  );

  const performEquipmentAction = async (
    action: (signal: AbortSignal) => Promise<EquipmentView>,
  ) => {
    const lease = beginOwnerAction();
    if (!lease || !session) return; // synchronous lease prevents double POST/DELETE
    const controller = new AbortController();
    mutationControllers.current.add(controller);
    try {
      await action(controller.signal); // validates the mutation receipt
      if (!isCurrentAction(lease) || controller.signal.aborted) return;
      // Another device may have changed equipment since the POST. Re-read
      // BOTH owner models; never pair the old POST result with new stacks.
      const snapshot = await readForCurrentOwner(session.accessToken, () => readConsistentEquipmentSnapshot(
        () => readForCurrentOwner(session.accessToken, () => Promise.all([
          fetchInventoryStacks(controller.signal),
          fetchEquipment(controller.signal),
        ]), controller.signal),
        controller.signal,
      ), controller.signal);
      if (!isCurrentAction(lease) || controller.signal.aborted) return;
      setLoadout(snapshot.equipment);
      setStacks(snapshot.stacks);
      setEquipmentError(null);
    } catch (reason) {
      if (!isCurrentAction(lease) || controller.signal.aborted) return;
      // Ambiguous write or refresh failure: hide stale available grants.
      setLoadout(null);
      setStacks([]);
      setEquipmentError(reason instanceof EquipmentApiError
        ? reason.code : 'inventory_request_failed');
    } finally {
      mutationControllers.current.delete(controller);
      finishOwnerAction(lease);
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
      {session && !loading && !error && !equipmentError && loadout && items.length === 0 && stacks.length === 0 && (
        <Alert severity="info" data-testid="inventory-empty">{t('empty')}</Alert>
      )}

      {session && equipmentLoading && !equipmentBusy && (
        <Stack direction="row" spacing={1.5} role="status" data-testid="equipment-loading" sx={{ alignItems: 'center' }}>
          <CircularProgress size={20} />
          <Typography>{t('loadout.loading')}</Typography>
        </Stack>
      )}

      {equipmentError && (
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Alert severity="warning" data-testid="equipment-error">
            {t('errors.' + equipmentError, { defaultValue: t('errors.inventory_request_failed') })}
          </Alert>
          <Button data-testid="inventory-equipment-retry" variant="outlined" disabled={equipmentBusy || equipmentLoading}
            onClick={refreshEquipment}>
            {t('loadout.refresh')}
          </Button>
        </Stack>
      )}

      {browseReady && loadout && (
        <InventoryLoadoutPanel loadout={loadout} busy={equipmentBusy}
          onUnequip={slot => void performEquipmentAction(signal => unequipInventoryItem(slot, signal))}
          onFind={showAvailableSlot} onRefresh={refreshEquipment} />
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
      {canBrowse && (
        <Paper variant="outlined" data-testid="inventory-browse-controls" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>{t('browse.title')}</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField inputRef={searchRef} fullWidth label={t('browse.search')} value={browseQuery}
                  onChange={event => setBrowseQuery(event.target.value)}
                  placeholder={t('browse.searchHint')}
                  slotProps={{ htmlInput: { 'data-testid': 'inventory-browse-search' } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="inventory-browse-filter-label">{t('browse.filterLabel')}</InputLabel>
                  <Select labelId="inventory-browse-filter-label" data-testid="inventory-browse-filter"
                    value={browseFilter} label={t('browse.filterLabel')}
                    onChange={event => setBrowseFilter(event.target.value as InventoryBrowseFilter)}>
                    <MenuItem value="all">{t('browse.filters.all')}</MenuItem>
                    <MenuItem value="equipped">{t('browse.filters.equipped')}</MenuItem>
                    <MenuItem value="available">{t('browse.filters.available')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth>
                  <InputLabel id="inventory-browse-slot-label">{t('browse.slotLabel')}</InputLabel>
                  <Select labelId="inventory-browse-slot-label" data-testid="inventory-browse-slot"
                    value={browseSlot} label={t('browse.slotLabel')}
                    onChange={event => setBrowseSlot(event.target.value as InventoryBrowseSlot)}>
                    <MenuItem value="all">{t('browse.slots.all')}</MenuItem>
                    <MenuItem value="relic">{t('slots.relic')}</MenuItem>
                    <MenuItem value="charm">{t('slots.charm')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="inventory-browse-sort-label">{t('browse.sortLabel')}</InputLabel>
                  <Select labelId="inventory-browse-sort-label" data-testid="inventory-browse-sort"
                    value={browseSort} label={t('browse.sortLabel')}
                    onChange={event => setBrowseSort(event.target.value as InventoryBrowseSort)}>
                    <MenuItem value="name">{t('browse.sorts.name')}</MenuItem>
                    <MenuItem value="quantity">{t('browse.sorts.quantity')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Typography data-testid="inventory-browse-results" component="p" variant="body2" color="text.secondary" aria-live="polite">
                {t('browse.results', { shown: displayedStacks.length + displayedItems.length, total: stacks.length + items.length })}
              </Typography>
              {(browseQuery || browseFilter !== 'all' || browseSlot !== 'all' || browseSort !== 'name') && (
                <Button data-testid="inventory-browse-clear" size="small" onClick={resetBrowse} sx={{ alignSelf: 'flex-start' }}>
                  {t('browse.clear')}
                </Button>
              )}
            </Stack>
            {noMatches && (
              <Alert severity="info" data-testid="inventory-browse-empty" role="status">
                {t('browse.noMatches')}
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      {displayedStacks.length > 0 && (
        <Stack spacing={1.5} data-testid="inventory-stacks">
          <Typography variant="h5">{t('stacksTitle')}</Typography>
          {displayedStacks.map(stack => {
            const labelKey = inventoryItemLabelKeys[stack.itemKey];
            const slot = equipmentSlotFor(stack.itemKey);
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
                        disabled={equipmentBusy || !browseReady}
                        onClick={() => void performEquipmentAction(signal => unequipInventoryItem(slot, signal))}>
                        {t('unequip')}
                      </Button>
                    ) : slot && stack.availableGrantIds.length > 0 ? (
                      <Button data-testid="inventory-equip" variant="contained"
                        disabled={equipmentBusy || !browseReady || occupied}
                        onClick={() => void performEquipmentAction(
                          signal => equipInventoryItem(stack.availableGrantIds[0], signal)
                        )}>
                        {t('equip')}
                      </Button>
                    ) : null}
                    {stack.itemKey === 'item.grove_seed.v1' && stack.availableGrantIds.length > 0 && (
                      <HealingItemAction key={stack.availableGrantIds[0]}
                        grantId={stack.availableGrantIds[0]}
                        accessToken={session!.accessToken}
                        disabled={equipmentBusy || !browseReady}
                        onBegin={beginHealing}
                        onFinished={finishHealing}
                        onHealed={refreshAfterHealing} />
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

      {displayedItems.length > 0 && (
        <Stack spacing={1.5} data-testid="inventory-items">
          <Typography variant="h5">{t('owned', { count: displayedItems.length })}</Typography>
          {displayedItems.map(award => {
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
                    label={award.consumed ? t('consumed') : t('quantity', { count: award.quantity })} />
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
