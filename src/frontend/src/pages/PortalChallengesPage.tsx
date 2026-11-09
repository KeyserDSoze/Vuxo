import { Alert, Box, Button, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { readStoredSession } from '../features/auth/authSession';
import { inventoryItemLabelKeys } from '../features/inventory/inventoryApi';
import {
  fetchPortalChallenge,
  fetchPortalGrants,
  PortalApiError,
  type PortalMistakeDamage,
  submitPortalChallenge,
  type PortalChallenge,
  type PortalGrant,
} from '../features/portals/portalApi';

const runes = ['sun', 'moon', 'star', 'wave'] as const;
const runeMarks: Record<typeof runes[number], string> = {
  sun: '☀', moon: '☾', star: '✦', wave: '≈',
};
const previewDurationMs = 3500;

type PortalChallengesPageProps = {
  initialGrantId?: string;
  onCompleted?: (grantId: string) => void;
  onExit?: () => void;
};

export function PortalChallengesPage({
  initialGrantId,
  onCompleted,
  onExit,
}: PortalChallengesPageProps = {}) {
  const { t } = useTranslation('portals');
  const { t: inventoryText } = useTranslation('inventory');
  const autoStarted = useRef(false);
  const [grants, setGrants] = useState<PortalGrant[]>([]);
  const [selected, setSelected] = useState<PortalGrant | null>(null);
  const [challenge, setChallenge] = useState<PortalChallenge | null>(null);
  const [answer, setAnswer] = useState<string[]>([]);
  const [showing, setShowing] = useState(false);
  const [previewRound, setPreviewRound] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [rewardedItemKey, setRewardedItemKey] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [mistakeDamage, setMistakeDamage] = useState<PortalMistakeDamage | null>(null);
  const session = readStoredSession();

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void fetchPortalGrants(controller.signal)
      .then(items => {
        if (!controller.signal.aborted) setGrants(items);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setErrorCode(error instanceof PortalApiError ? error.code : 'portal_request_failed');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!challenge || !showing) return;
    const timer = window.setTimeout(() => setShowing(false), previewDurationMs);
    return () => window.clearTimeout(timer);
  }, [challenge, showing, previewRound]);

  const start = async (grant: PortalGrant) => {
    setBusy(true);
    setErrorCode(null);
    setMistakeDamage(null);
    setAnswer([]);
    setCompleted(false);
    setRewardedItemKey(null);
    setSelected(null);
    setChallenge(null);
    try {
      const result = await fetchPortalChallenge(grant.id);
      setChallenge(result);
      setSelected(grant);
      setShowing(true);
      setPreviewRound(value => value + 1);
    } catch (error) {
      setErrorCode(error instanceof PortalApiError ? error.code : 'portal_request_failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialGrantId || loading || autoStarted.current) return;
    const grant = grants.find(item => item.id === initialGrantId);
    if (!grant) return;
    autoStarted.current = true;
    void start(grant);
  }, [initialGrantId, loading, grants]);

  const submit = async () => {
    if (!selected || !challenge || answer.length !== challenge.sequence.length) return;
    setBusy(true);
    setErrorCode(null);
    setMistakeDamage(null);
    try {
      const receipt = await submitPortalChallenge(selected.id, answer);
      setRewardedItemKey(receipt.itemKey ?? null);
      setCompleted(true);
      setGrants(items => items.filter(grant => grant.id !== selected.id));
      onCompleted?.(selected.id);
    } catch (error) {
      setAnswer([]);
      setErrorCode(error instanceof PortalApiError ? error.code : 'portal_request_failed');
      setMistakeDamage(error instanceof PortalApiError ? error.mistakeDamage : null);
    } finally {
      setBusy(false);
    }
  };

  const previewAgain = () => {
    setAnswer([]);
    setErrorCode(null);
    setMistakeDamage(null);
    setShowing(true);
    setPreviewRound(value => value + 1);
  };

  return (
    <Stack spacing={2} data-testid="portal-page" className="vuxo-portal-console">
      <Paper component="header" className="vuxo-portal-console__hero" variant="outlined"
        data-testid="portal-console-hero" sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Box>
            <Typography component="p" variant="overline" color="primary.main" sx={{ fontWeight: 850 }}>
              {t('console.eyebrow')}
            </Typography>
            <Typography variant="h2" component="h1">{t('title')}</Typography>
            <Typography color="text.secondary">{t('description')}</Typography>
          </Box>
          {session && !loading && (
            <Chip data-testid="portal-console-count" variant="outlined" color="primary"
              icon={<AutoAwesome />} label={t('console.availableCount', { count: grants.length })} />
          )}
        </Stack>
      </Paper>

      {!session ? (
        <Alert severity="info" data-testid="portal-auth-required">
          {t('authenticationRequired')}{' '}
          <Button component={RouterLink} to="/auth" size="small">{t('signIn')}</Button>
        </Alert>
      ) : null}

      {errorCode ? (
        <Alert severity="error" data-testid="portal-error">
          {t('errors.' + errorCode, { defaultValue: t('errors.portal_request_failed') })}
        </Alert>
      ) : null}

      {mistakeDamage && errorCode === 'portal_challenge_incorrect' ? (
        <Alert severity={mistakeDamage.damageApplied && mistakeDamage.damage > 0 ? 'warning' : 'info'}
          data-testid="portal-mistake-damage" role="status">
          {mistakeDamage.damageApplied && mistakeDamage.damage > 0
            ? t('mistakeDamage', {
              damage: mistakeDamage.damage,
              current: mistakeDamage.currentHealth,
              maximum: mistakeDamage.maxHealth,
            })
            : t('mistakeAlreadyRecorded', {
              current: mistakeDamage.currentHealth,
              maximum: mistakeDamage.maxHealth,
            })}
          {' '}
          <Button component={RouterLink} to="/refuge" size="small">{t('visitRefuge')}</Button>
        </Alert>
      ) : null}

      {session && loading ? <CircularProgress aria-label={t('loading')} /> : null}

      {session && !loading && !challenge && !busy && grants.length === 0 && !errorCode ? (
        <Alert severity="info" data-testid="portal-empty">{t('empty')}</Alert>
      ) : null}

      {session && !challenge && grants.length > 0 ? (
        <Stack spacing={1.5} data-testid="portal-console-gateways">
          <Typography variant="h5">{t('available')}</Typography>
          <Grid container spacing={1.5}>
            {grants.map(grant => (
              <Grid key={grant.id} size={{ xs: 12, md: 6, xl: 4 }}>
                <Paper variant="outlined" className="vuxo-portal-console__gateway"
                  data-testid="portal-console-gateway" sx={{ p: { xs: 1.5, sm: 2.5 } }}>
                  <Stack spacing={1.5} sx={{ alignItems: 'flex-start', height: '100%' }}>
                    <Box aria-hidden="true" className="vuxo-portal-console__gateway-mark">✦</Box>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', flexGrow: 1 }}>
                      {t('console.assignment', { key: grant.contentKey })}
                    </Typography>
                    <Button data-testid="portal-start" variant="contained" startIcon={<AutoAwesome />}
                      disabled={busy} onClick={() => void start(grant)}>
                      {t('start')}
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Stack>
      ) : null}

      {challenge && selected ? (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 3 } }}
          className="vuxo-portal-console__arena" data-testid="portal-challenge">
          <Stack spacing={2}>
            <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h5">{t('memoryTitle')}</Typography>
              <Chip data-testid="portal-console-phase" size="small" variant="outlined" color={completed ? 'success' : 'primary'}
                label={t(completed ? 'console.completeStage' : showing ? 'console.previewStage' : 'console.answerStage')} />
            </Stack>
            <Typography variant="caption" color="text.secondary">{t('console.serverPolicy')}</Typography>
            {completed ? (
              <>
                <Alert severity="success" data-testid="portal-complete">{t('completed')}</Alert>
                {rewardedItemKey && inventoryItemLabelKeys[rewardedItemKey] && (
                  <Alert severity="success" data-testid="portal-award">
                    {t('awardReceived', {
                      item: inventoryText('items.' + inventoryItemLabelKeys[rewardedItemKey])
                    })}
                  </Alert>
                )}
              </>
            ) : showing ? (
              <>
                <Typography>{t('memorize')}</Typography>
                <Box className="vuxo-portal-console__preview" data-testid="portal-preview">
                  {challenge.sequence.map((rune, index) => (
                    <Paper key={index} variant="outlined" className="vuxo-portal-console__preview-rune">
                      <Box component="span" aria-hidden="true" className="vuxo-portal-console__rune-mark">
                        {runeMarks[rune as keyof typeof runeMarks] ?? '✧'}
                      </Box>
                      <Typography sx={{ fontWeight: 800 }}>{t('runes.' + rune)}</Typography>
                    </Paper>
                  ))}
                </Box>
              </>
            ) : (
              <>
                <Typography>{t('repeat')}</Typography>
                <Typography data-testid="portal-progress">
                  {t('progress', { current: answer.length, total: challenge.sequence.length })}
                </Typography>
                <Box component="ol" className="vuxo-portal-console__answer"
                  aria-label={t('console.answerSlots')} data-testid="portal-answer-slots">
                  {Array.from({ length: challenge.sequence.length }, (_, index) => {
                    const entered = answer[index] as typeof runes[number] | undefined;
                    return (
                      <Box component="li" key={index} data-testid={'portal-answer-slot-' + index}
                        aria-label={entered ? t('runes.' + entered) : t('console.emptySlot')}
                        className={entered ? 'vuxo-portal-console__answer-slot is-filled' : 'vuxo-portal-console__answer-slot'}>
                        {entered ? (
                          <>
                            <Box aria-hidden="true" component="span">{runeMarks[entered]}</Box>
                            <Typography component="span" variant="caption">{t('runes.' + entered)}</Typography>
                          </>
                        ) : <Box component="span" aria-hidden="true">·</Box>}
                      </Box>
                    );
                  })}
                </Box>
                <LinearProgress variant="determinate" data-testid="portal-answer-meter"
                  aria-label={t('progress', { current: answer.length, total: challenge.sequence.length })}
                  value={challenge.sequence.length > 0 ? answer.length / challenge.sequence.length * 100 : 0}
                  sx={{ height: 8, borderRadius: 4 }} />
                <Box component="div" className="vuxo-portal-console__pad" role="group" aria-label={t('console.runePad')}>
                  {runes.map(rune => (
                    <Button key={rune} data-testid={'portal-rune-' + rune} variant="outlined"
                      className="vuxo-portal-console__rune-button"
                      disabled={busy || answer.length >= challenge.sequence.length}
                      onClick={() => setAnswer(values => [...values, rune])}>
                      <Box component="span" aria-hidden="true" className="vuxo-portal-console__rune-mark">
                        {runeMarks[rune]}
                      </Box>
                      <Typography component="span" variant="body2" sx={{ fontWeight: 800 }}>
                        {t('runes.' + rune)}
                      </Typography>
                    </Button>
                  ))}
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Button
                    data-testid="portal-submit"
                    variant="contained"
                    disabled={busy || answer.length !== challenge.sequence.length}
                    onClick={() => void submit()}
                  >{t('submit')}</Button>
                  <Button disabled={busy} onClick={() => setAnswer([])}>{t('reset')}</Button>
                  <Button disabled={busy} onClick={previewAgain}>{t('showAgain')}</Button>
                </Stack>
              </>
            )}
            <Button
              variant="text"
              onClick={() => {
                if (onExit) {
                  onExit();
                  return;
                }
                setChallenge(null);
                setSelected(null);
                setErrorCode(null);
              }}
            >{t('back')}</Button>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
