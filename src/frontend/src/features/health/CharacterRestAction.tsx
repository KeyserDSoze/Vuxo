import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { restCharacter, CharacterRestApiError, type CharacterRestResult } from './characterRestApi';
import type { CharacterHealth } from './characterHealthApi';
import { usePortalEncounterStatus } from './usePortalEncounterStatus';
import { readStoredSession } from '../auth/authSession';

type Props = {
  accessToken: string;
  health: CharacterHealth;
  onRested: (outcome: CharacterRestResult) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function CharacterRestAction({ accessToken, health, onRested, onBusyChange }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [restored, setRestored] = useState(0);
  const encounter = usePortalEncounterStatus(accessToken);
  const pendingKey = useRef<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  // A different account must never inherit a pending replay key or be shown
  // the result of the previous account's in-flight healing request.
  useEffect(() => {
    setFeedback(null);
    pendingKey.current = null;
    setBusy(false);
    return () => {
      activeRequest.current?.abort();
      inFlight.current = false;
    };
  }, [accessToken]);

  const canRest = health.currentHealth > 0 && health.currentHealth < health.maxHealth;
  const attempt = async () => {
    if (!canRest || encounter.active || encounter.loading || encounter.unavailable || busy || inFlight.current ||
        feedback === 'success' || readStoredSession()?.accessToken !== accessToken) return;
    inFlight.current = true;
    onBusyChange?.(true);
    const key = pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setFeedback(null);
    try {
      const outcome = await restCharacter(accessToken, key, controller.signal);
      if (controller.signal.aborted) return;
      pendingKey.current = null;
      setRestored(outcome.restoredHealth);
      setFeedback('success');
      onRested(outcome); // canonical server response, never locally guessed HP
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof CharacterRestApiError ? error.code : 'rest_unavailable';
      if (code === 'rest_cooldown' || code === 'rest_encounter_active' ||
          code === 'rest_already_full' ||
          code === 'rest_unavailable' && error instanceof CharacterRestApiError && error.status === 409 ||
          code === 'character_not_found') {
        pendingKey.current = null; // definitive server rejection: a new intention uses a new key
      }
      setFeedback(
        code === 'rest_encounter_active' ? 'encounter' :
        code === 'rest_cooldown' ? 'cooldown' :
        code === 'rest_already_full' ? 'full' :
        code === 'rest_unavailable' && error instanceof CharacterRestApiError && error.status === 409
          ? 'downed' : 'error',
      );
    } finally {
      // A previous account's aborted request must not release the new
      // account's in-flight lock or change its busy state.
      if (activeRequest.current === controller) {
        inFlight.current = false;
        onBusyChange?.(false);
        activeRequest.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  };

  return (
    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }} data-testid="refuge-rest">
      <Typography color="text.secondary">{t('refuge.rest.description')}</Typography>
      {feedback === 'success' && (
        <Alert severity="success" data-testid="refuge-rest-success" role="status">
          {t('refuge.rest.success', { amount: restored })}
        </Alert>
      )}
      {(encounter.active || feedback === 'encounter') && (
        <Alert severity="warning" data-testid="refuge-rest-encounter">
          {t('refuge.rest.encounterActive')}{' '}
          <Button data-testid="refuge-encounter-refresh" size="small"
            disabled={encounter.loading}
            onClick={encounter.refresh}>
            {t('refuge.rest.refreshEncounter')}
          </Button>
        </Alert>
      )}
      {encounter.unavailable && (
        <Alert data-testid="refuge-rest-encounter-unavailable" severity="warning">
          {t('refuge.rest.encounterUnavailable')}{' '}
          <Button data-testid="refuge-encounter-retry" size="small"
            disabled={encounter.loading} onClick={encounter.refresh}>
            {t('refuge.rest.refreshEncounter')}
          </Button>
        </Alert>
      )}
      {feedback === 'cooldown' && (
        <Alert severity="info" data-testid="refuge-rest-cooldown">{t('refuge.rest.cooldown')}</Alert>
      )}
      {feedback === 'error' && (
        <Alert severity="warning" data-testid="refuge-rest-error">{t('refuge.rest.error')}</Alert>
      )}
      {feedback === 'downed' && (
        <Alert severity="warning" data-testid="refuge-rest-downed">{t('refuge.rest.downed')}</Alert>
      )}
      {(health.currentHealth === health.maxHealth || feedback === 'full') && (
        <Typography data-testid="refuge-rest-full" color="text.secondary">
          {t('refuge.rest.full')}
        </Typography>
      )}
      {health.currentHealth === 0 && health.maxHealth > 0 && (
        <Typography data-testid="refuge-rest-zero-hp" color="text.secondary">
          {t('refuge.rest.downed')}
        </Typography>
      )}
      {canRest && (
        <Button
          data-testid="refuge-rest-button"
          variant="contained"
          disabled={busy || encounter.loading || encounter.active || encounter.unavailable || feedback === 'success'}
          onClick={() => { void attempt(); }}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {t(busy ? 'refuge.rest.inProgress' : feedback === 'error' ? 'refuge.rest.retry' : 'refuge.rest.action')}
        </Button>
      )}
    </Stack>
  );
}
