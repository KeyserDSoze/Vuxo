import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { AutoAwesome, BackpackOutlined, CloseRounded, ExploreOutlined, FavoriteBorder, HistoryOutlined, SearchOutlined, ViewModuleOutlined, VisibilityOutlined } from '@mui/icons-material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useStoredSession } from '../features/auth/useStoredSession';
import type { VuxoSession } from '../features/auth/authSession';
import { browseInventory, equipmentSlotFor, type InventoryBrowseFilter, type InventoryBrowseSlot, type InventoryBrowseSort } from '../features/inventory/inventoryBrowse';
import { INVENTORY_JOURNAL_PAGE_SIZE, pageInventoryJournal } from '../features/inventory/inventoryJournal';
import { InventoryLoadoutPanel } from '../features/inventory/InventoryLoadoutPanel';
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

type InventoryViewMode = 'all' | 'gear' | 'bag' | 'journal';
// These are strictly presentation tabs; API queries and owner-bound
// inventories do not depend on the chosen view.
const inventoryViews = [
  { key: 'all', icon: ViewModuleOutlined },
  { key: 'gear', icon: AutoAwesome },
  { key: 'bag', icon: BackpackOutlined },
  { key: 'journal', icon: HistoryOutlined },
] as const;

function iconForInventoryItem(itemKey: string) {
  if (itemKey === 'item.rune_shard.v1') return AutoAwesome;
  if (itemKey === 'item.grove_seed.v1') return FavoriteBorder;
  if (itemKey === 'item.tidal_pearl.v1') return ExploreOutlined;
  return BackpackOutlined;
}

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
  const [viewMode, setViewMode] = useState<InventoryViewMode>('all');
  const [journalVisibleCount, setJournalVisibleCount] = useState(INVENTORY_JOURNAL_PAGE_SIZE);
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseFilter, setBrowseFilter] = useState<InventoryBrowseFilter>('all');
  const [browseSlot, setBrowseSlot] = useState<InventoryBrowseSlot>('all');
  const [browseSort, setBrowseSort] = useState<InventoryBrowseSort>('name');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingQuickFind = useRef(false);
  // Pure UI selection; the authenticated owner read-model remains authoritative.
  const [inspectedItemKey, setInspectedItemKey] = useState<string | null>(null);

  useEffect(() => {
    setItems([]);
    setStacks([]);
    setLoadout(null);
    setError(null);
    setEquipmentError(null);
    setEquipmentLoading(Boolean(session));
    setHealingResult(null);
    setHealingRefreshError(false);
    setInspectedItemKey(null);
    setViewMode('all');
    setJournalVisibleCount(INVENTORY_JOURNAL_PAGE_SIZE);
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
  }, [session?.accessToken, inventoryRevision]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setEquipmentLoading(true);
    setEquipmentError(null);
    // Hide the previous snapshot until both owner-scoped reads succeed.
    setLoadout(null);
    setStacks([]);
    void Promise.all([
      fetchInventoryStacks(controller.signal),
      fetchEquipment(controller.signal),
    ]).then(([stackData, equipmentData]) => {
      if (controller.signal.aborted) return;
      setStacks(stackData);
      setLoadout(equipmentData);
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
  // The chronicle is a complete owner-backed grant history. Hidden
  // Backpack filters must never silently hide events or consumed awards.
  const displayedItems = browseReady
    ? viewMode === 'journal' ? items : view.awards
    : items;
  const noMatches = canBrowse && displayedStacks.length === 0 && displayedItems.length === 0;
  const journalPage = pageInventoryJournal(displayedItems, journalVisibleCount);
  // The owner-scoped API snapshot remains complete; progressive rendering
  // limits only the visible Paper entries inside the existing game-deck scroll.
  useEffect(() => {
    setJournalVisibleCount(INVENTORY_JOURNAL_PAGE_SIZE);
  }, [browseQuery, browseFilter, browseSlot, browseSort, viewMode, inventoryRevision]);
  const showGear = viewMode === 'all' || viewMode === 'gear';
  const showBag = viewMode === 'all' || viewMode === 'bag';
  const showJournal = viewMode === 'all' || viewMode === 'journal';
  const chooseView = (mode: InventoryViewMode) => {
    // A hidden item's inspection must never remain open over a different
    // mode. No network request is made by these presentation-only buttons.
    setInspectedItemKey(null);
    setJournalVisibleCount(INVENTORY_JOURNAL_PAGE_SIZE);
    setViewMode(mode);
  };

  const inspectedStack = browseReady ? stacks.find(stack => stack.itemKey === inspectedItemKey) : undefined;
  const inspectedIcon = inspectedStack ? iconForInventoryItem(inspectedStack.itemKey) : BackpackOutlined;
  const InspectedIcon = inspectedIcon;
  const inspectedSlot = inspectedStack ? equipmentSlotFor(inspectedStack.itemKey) : null;

  const resetBrowse = () => {
    setBrowseQuery('');
    setBrowseFilter('all');
    setBrowseSlot('all');
    setBrowseSort('name');
  };

  const showAvailableSlot = (slot: Exclude<InventoryBrowseSlot, 'all'>) => {
    if (!browseReady) return;
    // Use the same post-mount focus/reveal path as Ctrl/Meta+K (#216).
    // Focus before the Backpack is rendered is a no-op; raw .focus() after
    // render can scroll the document instead of the GameDeck scroller.
    pendingQuickFind.current = true;
    chooseView('bag');
    setBrowseFilter('available');
    setBrowseSlot(slot);
    setBrowseQuery('');
  };

  const focusQuickFind = useCallback(() => {
    // Reveal the search input inside the GameDeck scroller, not the document:
    // in "All" mode the equipment board can push search below the viewport.
    const field = searchRef.current;
    if (!field) return;
    const deck = document.querySelector<HTMLElement>('[data-testid="game-deck-scroll"]');
    if (deck) {
      const area = deck.getBoundingClientRect();
      const target = field.getBoundingClientRect();
      const navigation = deck.querySelector<HTMLElement>('[data-testid="inventory-views"]');
      const stickyHeight = navigation?.getBoundingClientRect().height ?? 0;
      const visibleTop = area.top + stickyHeight + 12;
      const visibleBottom = area.bottom - 12;
      if (target.top < visibleTop) deck.scrollTop += target.top - visibleTop;
      else if (target.bottom > visibleBottom) deck.scrollTop += target.bottom - visibleBottom;
    }
    field.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // Gear and History do not mount Backpack search. Focus only after React
    // has committed the new view, never a detached or stale input element.
    if (!pendingQuickFind.current || !canBrowse || viewMode !== 'bag') return;
    pendingQuickFind.current = false;
    focusQuickFind();
  }, [canBrowse, viewMode, focusQuickFind]);

  const openQuickFind = useCallback(() => {
    if (!canBrowse) return;
    if (viewMode === 'gear' || viewMode === 'journal') {
      pendingQuickFind.current = true;
      setInspectedItemKey(null);
      setJournalVisibleCount(INVENTORY_JOURNAL_PAGE_SIZE);
      setViewMode('bag');
    } else {
      focusQuickFind();
    }
  }, [canBrowse, viewMode, focusQuickFind]);

  useEffect(() => {
    if (!canBrowse) return;
    const onQuickFind = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.code !== 'KeyK' ||
          event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey ||
          event.repeat || event.isComposing || event.ctrlKey === event.metaKey) return;
      const editing = (target: EventTarget | null) => target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]') !== null;
      if (editing(event.target) || editing(document.activeElement) ||
          document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      event.preventDefault();
      openQuickFind();
    };
    document.addEventListener('keydown', onQuickFind);
    return () => document.removeEventListener('keydown', onQuickFind);
  }, [canBrowse, openQuickFind]);


  const refreshEquipment = () => {
    if (equipmentBusy || equipmentLoading) return;
    setInspectedItemKey(null);
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

  const performEquipmentAction = async (action: () => Promise<EquipmentView>) => {
    if (!browseReady || equipmentBusy || equipmentLoading) return;
    setInspectedItemKey(null);
    setEquipmentBusy(true);
    try {
      const result = await action();
      // Only display a new loadout alongside the matching server stack snapshot.
      const freshStacks = await fetchInventoryStacks();
      setLoadout(result);
      setStacks(freshStacks);
      setEquipmentError(null);
    } catch (reason) {
      // The mutation may have succeeded despite a lost response or refresh failure.
      // Never present stale grant availability; require a safe read-only refresh.
      setLoadout(null);
      setStacks([]);
      setEquipmentError(reason instanceof EquipmentApiError
        ? reason.code : 'inventory_request_failed');
    } finally {
      setEquipmentBusy(false);
    }
  };

  return (
    <Stack spacing={2} data-testid="inventory-page">
      <Box>
        <Typography variant="h2" component="h1" sx={{ typography: { xs: 'h3', sm: 'h2' }, overflowWrap: 'anywhere' }}>{t('title')}</Typography>
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
      {session && !loading && !error && items.length === 0 && stacks.length === 0 && (
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

      {browseReady && (
        <Box component="nav" data-testid="inventory-views" aria-label={t('views.navigation')}
          className="vuxo-inventory-views" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
          <Stack direction="row" className="vuxo-inventory-views__bar"
            sx={{ alignItems: 'center', gap: .75, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} className="vuxo-inventory-views__options">
              {inventoryViews.map(({ key, icon: Icon }) => (
                <Button key={key} data-testid={'inventory-view-' + key}
                  aria-pressed={viewMode === key} variant={viewMode === key ? 'contained' : 'outlined'}
                  startIcon={<Icon fontSize="small" aria-hidden="true" />}
                  onClick={() => chooseView(key)} className="vuxo-inventory-views__button">
                  {t('views.' + key)}
                </Button>
              ))}
            </Stack>
            <IconButton className="vuxo-inventory-quick-find" color="primary"
              data-testid="inventory-quick-find-action"
              aria-label={t('browse.search')}
              aria-keyshortcuts="Control+K Meta+K"
              title={t('browse.search')}
              disabled={!canBrowse}
              onClick={openQuickFind}>
              <SearchOutlined fontSize="small" aria-hidden="true" />
            </IconButton>
          </Stack>
          <Typography variant="caption" component="p" color="text.secondary"
            data-testid="inventory-quick-find-hint" sx={{ px: 1, pt: .5, pb: .25 }}>
            {t('browse.quickFindHint')}
          </Typography>
        </Box>
      )}

      {browseReady && loadout && showGear && (
        <InventoryLoadoutPanel loadout={loadout} busy={equipmentBusy}
          onUnequip={slot => void performEquipmentAction(() => unequipInventoryItem(slot))}
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
      {canBrowse && showBag && (
        <Paper variant="outlined" data-testid="inventory-browse-controls" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>{t('browse.title')}</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField inputRef={searchRef} fullWidth label={t('browse.search')} value={browseQuery}
                  onChange={event => setBrowseQuery(event.target.value)}
                  onKeyDown={event => {
                    // Esc is a query-only reset when typing into inventory search:
                    // native Esc elsewhere must still reach dialogs/browser controls.
                    if (event.target === searchRef.current && event.key === 'Escape' &&
                        browseQuery && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.stopPropagation();
                      setBrowseQuery('');
                    }
                  }}
                  placeholder={t('browse.searchHint')}
                  slotProps={{
                    htmlInput: { 'data-testid': 'inventory-browse-search',
                      'aria-keyshortcuts': 'Control+K Meta+K Escape' },
                    input: {
                      endAdornment: browseQuery ? (
                        <InputAdornment position="end">
                          <IconButton data-testid="inventory-browse-clear-query"
                            size="small" aria-label={t('browse.clearQuery')}
                            title={t('browse.clearQuery')}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                              // Only clear the query: leave availability/slot/sort
                              // and the server-authoritative owner snapshot intact.
                              setBrowseQuery('');
                              searchRef.current?.focus({ preventScroll: true });
                            }}
                            sx={{ minWidth: 40, minHeight: 40 }}>
                            <CloseRounded fontSize="small" aria-hidden="true" />
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                    },
                  }}
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

      {showBag && displayedStacks.length > 0 && (
        <Stack spacing={1.5} data-testid="inventory-stacks">
          <Typography variant="h5">{t('stacksTitle')}</Typography>
          <Grid container spacing={1.5} data-testid="inventory-stack-grid">
            {displayedStacks.map(stack => {
              const labelKey = inventoryItemLabelKeys[stack.itemKey];
              const slot = equipmentSlotFor(stack.itemKey);
              const active = loadout?.items.find(item => item.itemKey === stack.itemKey);
              const occupied = Boolean(slot && loadout?.items.some(item => item.slot === slot));
              const Icon = iconForInventoryItem(stack.itemKey);
              return (
                <Grid key={stack.itemKey} size={{ xs: 12, sm: 6, xl: 4 }}>
                  <Paper variant="outlined" data-testid="inventory-stack"
                    className="vuxo-inventory-card" sx={{ height: '100%', p: { xs: 1.5, sm: 2 } }}>
                    <Stack spacing={1.25} sx={{ height: '100%' }}>
                      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
                        <Box className="vuxo-inventory-card__emblem" aria-hidden="true"
                          sx={{ color: 'primary.main', bgcolor: 'action.hover', borderColor: 'divider' }}>
                          <Icon fontSize="large" />
                        </Box>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography component="h3" variant="h6" sx={{ fontWeight: 850, overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                            {labelKey ? t('items.' + labelKey) : stack.itemKey}
                          </Typography>
                          {slot && <Chip size="small" variant="outlined" label={t('slots.' + slot)} sx={{ mt: .75 }} />}
                        </Box>
                      </Stack>
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Chip variant="outlined" size="small" label={t('stackQuantity', { count: stack.quantity })} />
                        <Chip color={stack.equippedQuantity > 0 ? 'primary' : 'default'} size="small"
                          label={t('equippedQuantity', { count: stack.equippedQuantity })} />
                      </Stack>
                      <Box sx={{ flexGrow: 1 }} />
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Button data-testid="inventory-inspect" size="small" variant="outlined"
                          startIcon={<VisibilityOutlined />}
                          onClick={() => setInspectedItemKey(stack.itemKey)}>
                          {t('inspect.open')}
                        </Button>
                        {active && slot ? (
                          <Button data-testid="inventory-unequip" variant="outlined" size="small"
                            disabled={equipmentBusy || !browseReady}
                            onClick={() => void performEquipmentAction(() => unequipInventoryItem(slot))}>
                            {t('unequip')}
                          </Button>
                        ) : slot && stack.availableGrantIds.length > 0 ? (
                          <Button data-testid="inventory-equip" variant="contained" size="small"
                            disabled={equipmentBusy || !browseReady || occupied}
                            onClick={() => void performEquipmentAction(
                              () => equipInventoryItem(stack.availableGrantIds[0])
                            )}>
                            {t('equip')}
                          </Button>
                        ) : null}
                        {stack.itemKey === 'item.grove_seed.v1' && stack.availableGrantIds.length > 0 && (
                          <HealingItemAction key={stack.availableGrantIds[0]}
                            grantId={stack.availableGrantIds[0]}
                            accessToken={session!.accessToken}
                            disabled={equipmentBusy || !browseReady}
                            onHealed={result => {
                              setInspectedItemKey(null);
                              setHealingResult(result);
                              setHealingRefreshError(false);
                              void Promise.all([
                                fetchInventoryStacks(),
                                fetchPlayerInventory(),
                              ]).then(([freshStacks, freshAwards]) => {
                                setStacks(freshStacks);
                                setItems(freshAwards);
                              }).catch(() => {
                                setStacks([]);
                                setItems([]);
                                setLoadout(null);
                                setEquipmentError('inventory_request_failed');
                                setHealingRefreshError(true);
                              });
                            }} />
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      )}

      {showGear && loadout?.stats && (
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

      {showJournal && displayedItems.length > 0 && (
        <Stack spacing={1.5} id="inventory-journal-list" data-testid="inventory-items">
          <Typography variant="h5">{t('owned', { count: displayedItems.length })}</Typography>
          {journalPage.visible.map(award => {
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
          {displayedItems.length > INVENTORY_JOURNAL_PAGE_SIZE && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between',
                p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary" data-testid="inventory-journal-progress"
                role="status" aria-live="polite">
                {t('journalProgress', { shown: journalPage.visible.length, total: displayedItems.length })}
              </Typography>
              <Button variant="outlined" size="small" data-testid="inventory-journal-more"
                aria-controls="inventory-journal-list" aria-disabled={journalPage.remaining === 0}
                sx={journalPage.remaining === 0 ? { opacity: 0.6, cursor: 'default' } : undefined}
                onClick={() => {
                  // Unlike native disabled, aria-disabled keeps keyboard focus
                  // on the completion control after the last journal batch.
                  if (journalPage.remaining > 0)
                    setJournalVisibleCount(current => current + INVENTORY_JOURNAL_PAGE_SIZE);
                }}>
                {journalPage.remaining > 0
                  ? t('journalMore', { count: Math.min(journalPage.remaining, INVENTORY_JOURNAL_PAGE_SIZE) })
                  : t('journalComplete')}
              </Button>
            </Stack>
          )}
        </Stack>
      )}
      <Dialog open={Boolean(inspectedStack)} onClose={() => setInspectedItemKey(null)}
        aria-labelledby="inventory-inspection-title" data-testid="inventory-inspection"
        fullWidth maxWidth="xs">
        <DialogTitle id="inventory-inspection-title" sx={{ fontWeight: 850 }}>{t('inspect.title')}</DialogTitle>
        <DialogContent dividers>
          {inspectedStack && (
            <Stack spacing={2} data-testid="inventory-inspection-content">
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
                <Box className="vuxo-inventory-card__emblem" aria-hidden="true"
                  sx={{ color: 'primary.main', bgcolor: 'action.hover', borderColor: 'divider' }}>
                  <InspectedIcon fontSize="large" />
                </Box>
                <Typography variant="h6" component="h3" sx={{ fontWeight: 850 }}>
                  {inventoryItemLabelKeys[inspectedStack.itemKey]
                    ? t('items.' + inventoryItemLabelKeys[inspectedStack.itemKey])
                    : inspectedStack.itemKey}
                </Typography>
              </Stack>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('inspect.canonicalKey')}</Typography>
                <Typography data-testid="inventory-inspection-key" sx={{ overflowWrap: 'anywhere' }}>
                  {inspectedStack.itemKey}
                </Typography>
              </Box>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Chip label={t('stackQuantity', { count: inspectedStack.quantity })} />
                <Chip label={t('equippedQuantity', { count: inspectedStack.equippedQuantity })} />
                {inspectedSlot && <Chip color="primary" variant="outlined" label={t('slots.' + inspectedSlot)} />}
              </Stack>
              <Typography variant="body2" color="text.secondary">{t('inspect.serverNote')}</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInspectedItemKey(null)}>{t('inspect.close')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
