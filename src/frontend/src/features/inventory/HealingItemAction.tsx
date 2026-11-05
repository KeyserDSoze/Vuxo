import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { consumeHealingItem, CharacterItemHealError, type CharacterItemHealResult } from './consumableApi';
import { usePortalEncounterStatus } from '../health/usePortalEncounterStatus';

type Props = {
  grantId: string;
  accessToken: string;
  disabled: boolean;
  onHealed: (result: CharacterItemHealResult) => void;
};

export function HealingItemAction({ grantId, accessToken, disabled, onHealed }: Props) {
  const { t } = useTranslation('inventory');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const encounter = usePortalEncounterStatus(accessToken);
  const pendingKey = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    pendingKey.current = null;
    setError(null);
    return () => request.current?.abort();
  }, [grantId]);

  const useItem = async () => {
    if (busy || disabled || encounter.active || encounter.loading) return;
    const key = pendingKey.current ?? crypto.randomUUID();
    pendingKey.current = key;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await consumeHealingItem(grantId, key, controller.signal);
      if (controller.signal.aborted) return;
      pendingKey.current = null;
      onHealed(result);
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
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Button data-testid="inventory-heal" variant="outlined"
        disabled={busy || disabled || encounter.loading || encounter.active}
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
      {error && (
        <Alert data-testid="inventory-heal-error" severity="warning">
          {t('errors.' + error, { defaultValue: t('errors.heal_request_failed') })}
        </Alert>
      )}
    </Stack>
  );
}
