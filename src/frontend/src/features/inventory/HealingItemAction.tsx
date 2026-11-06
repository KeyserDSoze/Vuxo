import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { consumeHealingItem, CharacterItemHealError, type CharacterItemHealResult } from './consumableApi';
import { usePortalEncounterStatus } from '../health/usePortalEncounterStatus';

type Props = {
  grantId: string;
  accessToken: string;
  disabled: boolean;
  onHealed: (result: CharacterItemHealResult) => Promise<void>;
  onBegin: () => boolean;
  onFinished: () => void;
};

export function HealingItemAction({
  grantId, accessToken, disabled, onHealed, onBegin, onFinished,
}: Props) {
  const { t } = useTranslation('translation', { keyPrefix: 'inventory' });
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const encounter = usePortalEncounterStatus(accessToken);
  const pendingKey = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    pendingKey.current = null;
    setCompleted(false);
    setError(null);
    return () => request.current?.abort();
  }, [grantId, accessToken]);

  const useItem = async () => {
    if (busy || inFlight.current || completed || disabled || encounter.active || encounter.loading || encounter.unavailable) return;
    // Reserve the shared owner lane synchronously: a second item or equipment
    // button must not start a competing request before React re-renders.
    if (!onBegin()) return;
    inFlight.current = true;
    const key = pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await consumeHealingItem(grantId, key, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      pendingKey.current = null;
      setCompleted(true); // Never spend the same grant a second time in this view.
      await onHealed(result); // Keep the lane until all owner reads finish.
    } catch (reason) {
      if (controller.signal.aborted) return;
      const code = reason instanceof CharacterItemHealError
        ? reason.code : 'heal_request_failed';
      // On ambiguous failures the server may have committed. Keep the same
      // request UUID. Definitive 4xx rejections allow a fresh intention.
      if (reason instanceof CharacterItemHealError &&
          reason.status >= 400 && reason.status < 500 &&
          reason.status !== 429) pendingKey.current = null;
      setError(code);
    } finally {
      inFlight.current = false;
      onFinished();
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Button data-testid="inventory-heal" variant="outlined"
        disabled={busy || completed || disabled || encounter.loading || encounter.active || encounter.unavailable}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        onClick={() => { void useItem(); }}>
        {t(busy ? 'healing.working' : error ? 'healing.retry' : 'healing.use')}
      </Button>
      {encounter.active && (
        <Alert data-testid="inventory-heal-encounter" severity="warning">
          {t('healing.encounterActive')}{' '}
          <Button data-testid="inventory-encounter-refresh" size="small"
            disabled={encounter.loading} onClick={encounter.refresh}>
            {t('healing.refreshEncounter')}
          </Button>
        </Alert>
      )}
      {encounter.unavailable && (
        <Alert data-testid="inventory-heal-encounter-unavailable" severity="warning">
          {t('healing.encounterUnavailable')}{' '}
          <Button data-testid="inventory-encounter-retry" size="small"
            disabled={encounter.loading} onClick={encounter.refresh}>
            {t('healing.refreshEncounter')}
          </Button>
        </Alert>
      )}
      {error && (
        <Alert data-testid="inventory-heal-error" severity="warning">
          {t('errors.' + error, { defaultValue: t('errors.heal_request_failed') })}
        </Alert>
      )}
    </Stack>
  );
}
