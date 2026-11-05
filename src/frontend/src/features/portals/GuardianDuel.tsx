import { Alert, Box, Button, CircularProgress, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import {
  fetchGuardian, playGuardianTurn, GuardianApiError,
  type GuardianAction, type GuardianStatus, type GuardianTurn,
} from './guardianApi';

type Props = { grantId: string };
type Pending = { action: GuardianAction; expectedTurn: number; key: string };

/**
 * This is a live world-portal PvE activity; the browser only submits card
 * intentions. It cannot set health, opponent state or unlock healing.
 */
export function GuardianDuel({ grantId }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GuardianStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<GuardianTurn | null>(null);
  const [revision, setRevision] = useState(0);
  const pending = useRef<Pending | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setLastTurn(null);
    setError(null);
    setLoading(true);
    void fetchGuardian(grantId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setStatus(result); })
      .catch(reason => {
        if (controller.signal.aborted) return;
        if (!(reason instanceof GuardianApiError && reason.status === 404)) {
          setError(reason instanceof GuardianApiError ? reason.code : 'guardian_request_failed');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [grantId, revision]);

  useEffect(() => () => inFlight.current?.abort(), [grantId]);

  const useCard = async (action: GuardianAction) => {
    if (busy || !status || status.outcome !== 'ongoing') return;
    const request = pending.current ?? {
      action, expectedTurn: status.turn, key: crypto.randomUUID(),
    };
    if (pending.current && pending.current.action !== action) return;
    pending.current = request;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await playGuardianTurn(grantId, request.action,
        request.expectedTurn, request.key, controller.signal);
      if (controller.signal.aborted) return;
      pending.current = null;
      setLastTurn(result);
      setStatus({
        grantId: result.grantId,
        turn: result.turn,
        guardianHealth: result.guardianHealth,
        guardianMaxHealth: result.guardianMaxHealth,
        playerHealth: result.playerHealth,
        playerMaxHealth: result.playerMaxHealth,
        outcome: result.outcome,
        ruleVersion: status.ruleVersion,
      });
    } catch (reason) {
      if (controller.signal.aborted) return;
      const code = reason instanceof GuardianApiError ? reason.code : 'guardian_request_failed';
      if (reason instanceof GuardianApiError &&
          reason.status >= 400 && reason.status < 500 && reason.status !== 429) {
        pending.current = null; // definitive rejection, not ambiguous completion
      }
      setError(code);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (inFlight.current === controller) inFlight.current = null;
    }
  };

  // A 404 means this was a direct off-world portal challenge or an expired
  // world encounter; the minigame remains usable on its own.
  if (!loading && !status && !error) return null;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }} data-testid="guardian-duel">
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">{t('game.guardian.title')}</Typography>
        <Typography color="text.secondary">{t('game.guardian.description')}</Typography>
        {loading && (
          <Stack direction="row" spacing={1} alignItems="center" role="status">
            <CircularProgress size={20} /><Typography>{t('game.guardian.loading')}</Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="warning" data-testid="guardian-error">
            {t('game.guardian.errors.' + error, { defaultValue: t('game.guardian.errors.guardian_request_failed') })}
          </Alert>
        )}
        {status && (
          <>
            <Box>
              <Typography data-testid="guardian-health">
                {t('game.guardian.enemyHealth', {
                  current: status.guardianHealth, maximum: status.guardianMaxHealth,
                })}
              </Typography>
              <LinearProgress variant="determinate" color="secondary"
                value={status.guardianMaxHealth > 0
                  ? Math.min(100, Math.max(0, status.guardianHealth * 100 / status.guardianMaxHealth))
                  : 0}
                aria-label={t('game.guardian.enemyHealth', {
                  current: status.guardianHealth, maximum: status.guardianMaxHealth,
                })} />
            </Box>
            <Typography data-testid="guardian-player-health">
              {t('game.guardian.playerHealth', {
                current: status.playerHealth, maximum: status.playerMaxHealth,
              })}
            </Typography>
            <Typography data-testid="guardian-turn">
              {t('game.guardian.turn', { turn: status.turn, maximum: 12 })}
            </Typography>
            {lastTurn && (
              <Alert severity={lastTurn.damageTaken > 0 ? 'warning' : 'info'}
                data-testid="guardian-turn-result">
                {t('game.guardian.turnResult', {
                  player: t('game.guardian.cards.' + lastTurn.action),
                  enemy: t('game.guardian.cards.' + lastTurn.guardianAction),
                  dealt: lastTurn.damageDealt,
                  taken: lastTurn.damageTaken,
                })}
              </Alert>
            )}
            {status.outcome === 'ongoing' ? (
              <Stack spacing={1.5}>
                <Typography>{t('game.guardian.choose')}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  {(['strike', 'guard'] as const).map(action => (
                    <Button key={action} data-testid={'guardian-' + action}
                      variant={action === 'strike' ? 'contained' : 'outlined'}
                      disabled={busy || (pending.current !== null &&
                        pending.current.action !== action)}
                      onClick={() => void useCard(action)}
                      startIcon={busy && pending.current?.action === action
                        ? <CircularProgress color="inherit" size={18} /> : undefined}>
                      {t('game.guardian.cards.' + action)}
                    </Button>
                  ))}
                </Stack>
                {error && pending.current && (
                  <Button data-testid="guardian-retry" variant="outlined"
                    disabled={busy}
                    onClick={() => void useCard(pending.current!.action)}>
                    {t('game.guardian.retryTurn')}
                  </Button>
                )}
              </Stack>
            ) : (
              <Alert severity={status.outcome === 'victory' ? 'success' : 'warning'}
                data-testid="guardian-outcome">
                {t('game.guardian.outcomes.' + status.outcome)}{' '}
                <Button component={RouterLink} to="/refuge" size="small">
                  {t('game.guardian.refuge')}
                </Button>
              </Alert>
            )}
          </>
        )}
        <Button data-testid="guardian-refresh" variant="text" size="small"
          disabled={loading || busy}
          onClick={() => setRevision(value => value + 1)}>
          {t('game.guardian.refresh')}
        </Button>
      </Stack>
    </Paper>
  );
}
