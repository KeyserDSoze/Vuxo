import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import {
  AuthApiError,
  exchangeSocialCredential,
  fetchSocialProviderConfiguration,
  logoutVuxo,
  type SocialProviderConfiguration,
} from '../features/auth/authApi';
import {
  clearStoredSession,
  readStoredSession,
  storeSession,
  type VuxoSession,
} from '../features/auth/authSession';
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton';
import { acquireMicrosoftIdToken } from '../features/auth/microsoftAuth';

type Provider = 'microsoft' | 'google';

export function AuthPage() {
  const { t: tAuth } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const [configuration, setConfiguration] = useState<SocialProviderConfiguration | null>(null);
  const [session, setSession] = useState<VuxoSession | null>(() => readStoredSession());
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSocialProviderConfiguration(controller.signal)
      .then(value => {
        setConfiguration(value);
        setErrorCode(null);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setErrorCode(error instanceof AuthApiError ? error.code : 'social_provider_configuration_unavailable');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingConfiguration(false);
      });

    return () => controller.abort();
  }, []);

  const completeLogin = useCallback(async (provider: Provider, credential: string) => {
    setBusyProvider(provider);
    setErrorCode(null);
    try {
      const newSession = await exchangeSocialCredential(provider, credential);
      storeSession(newSession);
      setSession(newSession);
    } catch (error) {
      setErrorCode(error instanceof AuthApiError ? error.code : 'social_login_failed');
    } finally {
      setBusyProvider(null);
    }
  }, []);

  const loginMicrosoft = async () => {
    const microsoft = configuration?.microsoft;
    if (!microsoft?.enabled || !microsoft.clientId || !microsoft.tenantId) return;

    setBusyProvider('microsoft');
    setErrorCode(null);
    try {
      const credential = await acquireMicrosoftIdToken({
        clientId: microsoft.clientId,
        tenantId: microsoft.tenantId,
      });
      const newSession = await exchangeSocialCredential('microsoft', credential);
      storeSession(newSession);
      setSession(newSession);
    } catch (error) {
      setErrorCode(error instanceof AuthApiError ? error.code : 'social_login_cancelled');
    } finally {
      setBusyProvider(null);
    }
  };

  const logout = async () => {
    if (!session) return;

    setErrorCode(null);
    try {
      await logoutVuxo(session.accessToken);
    } catch {
      // Vuxo JWTs are stateless in 0.0.1: local discard is the logout authority for the SPA.
    } finally {
      clearStoredSession();
      setSession(null);
    }
  };

  const providerBusy = busyProvider !== null;
  const noProviders = configuration
    && !configuration.microsoft.enabled
    && !configuration.google.enabled;

  return (
    <Stack spacing={3} data-testid="auth-page">
      <Stack spacing={1}>
        <Typography variant="h2" component="h1">{tAuth('title')}</Typography>
        <Typography color="text.secondary">{tAuth('description')}</Typography>
      </Stack>

      {errorCode ? (
        <Alert data-testid="auth-error" severity="error">
          {tErrors(errorCode, { defaultValue: tAuth('genericError') })}
        </Alert>
      ) : null}

      {session ? (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack spacing={2}>
            <Typography variant="h5">{tAuth('signedIn')}</Typography>
            <Typography data-testid="auth-user" sx={{ fontWeight: 700 }}>{session.user.displayName}</Typography>
            {session.user.email ? <Typography color="text.secondary">{session.user.email}</Typography> : null}
            <Typography variant="body2" color="text.secondary">
              {tAuth('sessionExpiry', { date: new Date(session.expiresAtUtc).toLocaleString() })}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button component={RouterLink} to="/character" variant="contained">{tAuth('continue')}</Button>
              <Button data-testid="auth-logout" variant="outlined" onClick={() => void logout()}>{tAuth('logout')}</Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
          {loadingConfiguration ? (
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <CircularProgress size={28} />
              <Typography>{tAuth('loadingProviders')}</Typography>
            </Stack>
          ) : noProviders ? (
            <Alert severity="info">{tAuth('noProviders')}</Alert>
          ) : (
            <Stack spacing={2} sx={{ maxWidth: 420 }}>
              {configuration?.microsoft.enabled
                && configuration.microsoft.clientId
                && configuration.microsoft.tenantId ? (
                  <Button
                    data-testid="auth-microsoft"
                    size="large"
                    variant="contained"
                    disabled={providerBusy}
                    onClick={() => void loginMicrosoft()}
                  >
                    {busyProvider === 'microsoft' ? tAuth('signingIn') : tAuth('microsoft')}
                  </Button>
                ) : null}

              {configuration?.google.enabled && configuration.google.clientId ? (
                <GoogleSignInButton
                  clientId={configuration.google.clientId}
                  disabled={providerBusy}
                  onCredential={credential => void completeLogin('google', credential)}
                  onError={() => setErrorCode('social_login_failed')}
                />
              ) : null}

              <Box>
                <Typography variant="body2" color="text.secondary">{tAuth('privacy')}</Typography>
              </Box>
            </Stack>
          )}
        </Paper>
      )}
    </Stack>
  );
}
