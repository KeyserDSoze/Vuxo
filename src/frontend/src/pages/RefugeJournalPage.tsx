import { AutoAwesome, BackpackOutlined, HistoryEduOutlined, Refresh } from '@mui/icons-material';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel,
  MenuItem, Paper, Select, Stack, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import type { VuxoSession } from '../features/auth/authSession';
import { useStoredSession } from '../features/auth/useStoredSession';
import { useOwnerFocusRefresh } from '../features/auth/useOwnerFocusRefresh';
import { readForCurrentOwner } from '../features/auth/ownerReadFence';
import { RefugePortalCompletionHistory } from '../features/refuge/RefugePortalCompletionHistory';
import { RefugeAdventureOverview } from '../features/refuge/RefugeAdventureOverview';
import { journalDestinationForMetric,
  type AdventureMetricKey, type JournalHistoryJump,
} from '../features/refuge/journalAdventureNavigation';
import type { AdventureHistorySnapshot } from '../features/refuge/refugeAdventureOverview';
import {
  fetchPlayerInventory, inventoryItemLabelKeys, type InventoryAward,
} from '../features/inventory/inventoryApi';
import {
  fetchPortalGrants, type PortalGrant,
} from '../features/portals/portalApi';
import {
  availableJournalPortals, journalRewards, type JournalRewardFilter,
} from '../features/refuge/refugeJournalModel';

/**
 * Mount data for each account separately so a token change cannot display
 * the previous player's journal while the new API reads are pending.
 */
export function RefugeJournalPage() {
  const session = useStoredSession();
  return <RefugeJournalSession key={session?.accessToken ?? 'guest'} session={session} />;
}

function RefugeJournalSession({ session }: { session: VuxoSession | null }) {
  const { t, i18n } = useTranslation();
  const [rewards, setRewards] = useState<InventoryAward[] | null>(null);
  const [portals, setPortals] = useState<PortalGrant[] | null>(null);
  const [rewardError, setRewardError] = useState(false);
  const [portalError, setPortalError] = useState(false);
  const [rewardRevision, setRewardRevision] = useState(0);
  const [portalRevision, setPortalRevision] = useState(0);
  const [filter, setFilter] = useState<JournalRewardFilter>('all');
  const [historyRevision, setHistoryRevision] = useState(0);
  // The audit child sends only committed owner-read counts. A missing snapshot
  // must never be rendered as zero or as another owner's past progress.
  const [historySnapshot, setHistorySnapshot] = useState<AdventureHistorySnapshot | null>(null);
  const [historyJump, setHistoryJump] = useState<JournalHistoryJump | null>(null);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setRewards(null);
    setRewardError(false);
    void readForCurrentOwner(session.accessToken, () => fetchPlayerInventory(controller.signal), controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setRewards(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRewardError(true);
      });
    return () => controller.abort();
  }, [session?.accessToken, rewardRevision]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setPortals(null);
    setPortalError(false);
    void readForCurrentOwner(session.accessToken, () => fetchPortalGrants(controller.signal), controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setPortals(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPortalError(true);
      });
    return () => controller.abort();
  }, [session?.accessToken, portalRevision]);

  const visibleRewards = useMemo(
    () => journalRewards(rewards ?? [], filter), [rewards, filter],
  );
  const visiblePortals = useMemo(
    () => availableJournalPortals(portals ?? []), [portals],
  );
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'it-IT';

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      : t('refuge.journal.dateUnavailable');
  };

  const refreshRewards = () => {
    setRewards(null);
    setRewardError(false);
    setRewardRevision(value => value + 1);
  };
  const refreshPortals = () => {
    setPortals(null);
    setPortalError(false);
    setPortalRevision(value => value + 1);
  };
  const refreshAll = () => {
    refreshRewards();
    refreshPortals();
    setHistorySnapshot(null);
    setHistoryJump(null);
    setHistoryRevision(value => value + 1);
  };

  function navigateToMetric(metric: AdventureMetricKey) {
    const target = journalDestinationForMetric(metric);
    if (target.section === 'history') {
      // Switch the audit mode/filter in the existing owner-scoped child.
      // Do not fetch anything for inventory/portal cards.
      setHistoryJump(previous => ({
        id: (previous?.id ?? 0) + 1, mode: target.mode, filter: target.filter,
      }));
    }
    const heading = document.getElementById(target.headingId);
    heading?.scrollIntoView({ behavior: 'auto', block: 'start' });
    heading?.focus({ preventScroll: true });
  }

  // A different device can spend an item or finish a portal while this
  // journal sits in another tab. On return discard the three old snapshots,
  // then re-read the server. Do not interrupt active reads or poll hidden tabs.
  useOwnerFocusRefresh(
    session?.accessToken ?? null,
    refreshAll,
    () => (rewards !== null || rewardError) && (portals !== null || portalError),
  );

  return (
    <Stack spacing={3} data-testid="refuge-journal-page">
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <HistoryEduOutlined color="primary" fontSize="large" aria-hidden="true" />
          <Typography component="h1" variant="h2">{t('refuge.journal.title')}</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: '70ch' }}>
            {t('refuge.journal.description')}
          </Typography>
          <Button component={RouterLink} to="/refuge" variant="text" data-testid="refuge-journal-back">
            {t('refuge.journal.back')}
          </Button>
          {!session ? (
            <Alert severity="info" data-testid="refuge-journal-auth-required">
              {t('refuge.journal.authRequired')}{' '}
              <Button component={RouterLink} to="/auth" size="small">
                {t('refuge.journal.signIn')}
              </Button>
            </Alert>
          ) : (
            <Button onClick={refreshAll} variant="outlined" data-testid="refuge-journal-refresh-all"
              startIcon={<Refresh />}>
              {t('refuge.journal.refreshAll')}
            </Button>
          )}
        </Stack>
      </Paper>

      {session && (
        <>
          <RefugeAdventureOverview
            inventory={rewardError ? null : rewards}
            portals={portalError ? null : portals}
            history={historySnapshot}
            onNavigate={navigateToMetric}
          />
          <Paper component="section" variant="outlined" aria-labelledby="refuge-journal-rewards-title"
            data-testid="refuge-journal-rewards" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }}
                sx={{ gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Stack spacing={0.5}>
                  <Typography id="refuge-journal-rewards-title" component="h2" tabIndex={-1}
                    variant="h5" sx={{ fontWeight: 800 }}>
                    {t('refuge.journal.rewards.title')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('refuge.journal.rewards.description')}
                  </Typography>
                </Stack>
                <Button data-testid="refuge-journal-rewards-refresh" variant="outlined" onClick={refreshRewards}
                  startIcon={<Refresh />} sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
                  {t('refuge.journal.retry')}
                </Button>
              </Stack>

              {rewards === null && !rewardError && (
                <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}
                  data-testid="refuge-journal-rewards-loading">
                  <CircularProgress size={23} />
                  <Typography>{t('refuge.journal.rewards.loading')}</Typography>
                </Stack>
              )}
              {rewardError && (
                <Alert severity="warning" data-testid="refuge-journal-rewards-error" role="status">
                  {t('refuge.journal.rewards.error')}
                </Alert>
              )}
              {rewards !== null && !rewardError && (
                <>
                  <FormControl size="small" sx={{ minWidth: { sm: 250 }, maxWidth: '100%' }}>
                    <InputLabel id="refuge-journal-filter-label">{t('refuge.journal.rewards.filterLabel')}</InputLabel>
                    <Select labelId="refuge-journal-filter-label" value={filter}
                      label={t('refuge.journal.rewards.filterLabel')} data-testid="refuge-journal-filter"
                      onChange={event => setFilter(event.target.value as JournalRewardFilter)}>
                      <MenuItem value="all">{t('refuge.journal.rewards.filters.all')}</MenuItem>
                      <MenuItem value="notConsumed">{t('refuge.journal.rewards.filters.notConsumed')}</MenuItem>
                      <MenuItem value="consumed">{t('refuge.journal.rewards.filters.consumed')}</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="body2" color="text.secondary" data-testid="refuge-journal-rewards-count" aria-live="polite">
                    {t('refuge.journal.rewards.count', { shown: visibleRewards.length, total: rewards.length })}
                  </Typography>
                  {rewards.length === 0 && (
                    <Alert severity="info" data-testid="refuge-journal-rewards-empty">
                      {t('refuge.journal.rewards.empty')}
                    </Alert>
                  )}
                  {rewards.length > 0 && visibleRewards.length === 0 && (
                    <Alert severity="info" data-testid="refuge-journal-rewards-no-match">
                      {t('refuge.journal.rewards.noMatch')}
                    </Alert>
                  )}
                  <Stack spacing={1.25} data-testid="refuge-journal-rewards-list">
                    {visibleRewards.map(reward => {
                      const itemKey = inventoryItemLabelKeys[reward.itemKey];
                      const label = itemKey
                        ? t('inventory.items.' + itemKey)
                        : t('refuge.journal.rewards.unknownItem');
                      return (
                        <Paper key={reward.grantId} variant="outlined" data-testid="refuge-journal-reward"
                          data-consumed={reward.consumed ? 'true' : 'false'} sx={{ p: 2 }}>
                          <Stack direction={{ xs: 'column', sm: 'row' }}
                            sx={{ gap: 1.25, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                                <BackpackOutlined color="primary" fontSize="small" aria-hidden="true" />
                                <Typography sx={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{label}</Typography>
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {t('refuge.journal.rewards.awarded', { date: formatDate(reward.awardedAtUtc) })}
                              </Typography>
                            </Stack>
                            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Chip variant="outlined" size="small"
                                label={t('refuge.journal.rewards.quantity', { count: reward.quantity })} />
                              <Chip size="small" color={reward.consumed ? 'default' : 'success'}
                                label={t(reward.consumed
                                  ? 'refuge.journal.rewards.consumed'
                                  : 'refuge.journal.rewards.notConsumed')} />
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                  <Button component={RouterLink} to="/inventory" size="small"
                    data-testid="refuge-journal-open-inventory" sx={{ alignSelf: 'flex-start' }}>
                    {t('refuge.journal.rewards.openInventory')}
                  </Button>
                </>
              )}
            </Stack>
          </Paper>

          <Paper component="section" variant="outlined" aria-labelledby="refuge-journal-portals-title"
            data-testid="refuge-journal-portals" sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }}
                sx={{ gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Stack spacing={0.5}>
                  <Typography id="refuge-journal-portals-title" component="h2" tabIndex={-1}
                    variant="h5" sx={{ fontWeight: 800 }}>
                    {t('refuge.journal.portals.title')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('refuge.journal.portals.description')}
                  </Typography>
                </Stack>
                <Button data-testid="refuge-journal-portals-refresh" variant="outlined" onClick={refreshPortals}
                  startIcon={<Refresh />} sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
                  {t('refuge.journal.retry')}
                </Button>
              </Stack>

              {portals === null && !portalError && (
                <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}
                  data-testid="refuge-journal-portals-loading">
                  <CircularProgress size={23} />
                  <Typography>{t('refuge.journal.portals.loading')}</Typography>
                </Stack>
              )}
              {portalError && (
                <Alert severity="warning" data-testid="refuge-journal-portals-error" role="status">
                  {t('refuge.journal.portals.error')}
                </Alert>
              )}
              {portals !== null && !portalError && (
                <>
                  <Typography variant="body2" color="text.secondary" data-testid="refuge-journal-portals-count">
                    {t('refuge.journal.portals.count', { count: portals.length })}
                  </Typography>
                  {portals.length === 0 && (
                    <Alert severity="info" data-testid="refuge-journal-portals-empty">
                      {t('refuge.journal.portals.empty')}
                    </Alert>
                  )}
                  <Stack spacing={1.25} data-testid="refuge-journal-portals-list">
                    {visiblePortals.map(portal => (
                      <Paper key={portal.id} variant="outlined" data-testid="refuge-journal-portal" sx={{ p: 2 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }}
                          sx={{ gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                          <Stack spacing={0.5}>
                            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                              <AutoAwesome fontSize="small" color="primary" aria-hidden="true" />
                              <Typography sx={{ fontWeight: 750 }}>{t('refuge.journal.portals.sequence')}</Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {t('refuge.journal.portals.reference', { reference: portal.id.slice(0, 8) })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {portal.expiresAtUtc
                                ? t('refuge.journal.portals.expires', { date: formatDate(portal.expiresAtUtc) })
                                : t('refuge.journal.portals.noExpiry')}
                            </Typography>
                          </Stack>
                          <Chip size="small" color="primary" variant="outlined"
                            label={t('refuge.journal.portals.available')} />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                  <Button component={RouterLink} to="/portals" size="small"
                    data-testid="refuge-journal-open-portals" sx={{ alignSelf: 'flex-start' }}>
                    {t('refuge.journal.portals.open')}
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
          <RefugePortalCompletionHistory key={session.accessToken + ':' + historyRevision}
            accessToken={session.accessToken} onSnapshotChange={setHistorySnapshot}
            navigation={historyJump} />
          <Alert severity="info" data-testid="refuge-journal-limits">
            {t('refuge.journal.disclaimer')}
          </Alert>
        </>
      )}
    </Stack>
  );
}
