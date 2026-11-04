import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { readStoredSession } from '../features/auth/authSession';
import {
  fetchPlayerInventory,
  inventoryItemLabelKeys,
  InventoryApiError,
  type InventoryAward,
} from '../features/inventory/inventoryApi';

export function InventoryPage() {
  const { t, i18n } = useTranslation('inventory');
  const session = readStoredSession();
  const [items, setItems] = useState<InventoryAward[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);

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
