import { Box, Button, CircularProgress } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      width?: number;
      locale?: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
    /** E2E-only override for testing the real GIS script lifecycle. */
    __vuxoE2ERealGoogleSdk?: boolean;
  }
}

let googleScriptPromise: Promise<void> | null = null;
let initializedGoogleClientId: string | null = null;
// GIS is global to the browser tab. Keep only the current mounted consumer
// callback while the singleton SDK configuration stays stable.
let activeGoogleCredentialHandler: ((response: GoogleCredentialResponse) => void) | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  const load = new Promise<void>((resolve, reject) => {
    const previous = document.querySelector<HTMLScriptElement>('script[data-vuxo-google-identity]');
    // A loaded script without a GIS global cannot be reused on retry.
    if (previous?.dataset.vuxoGoogleLoaded === 'true') previous.remove();
    const existing = previous?.isConnected ? previous : null;
    const script = existing ?? document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      if (window.google?.accounts?.id) {
        script.dataset.vuxoGoogleLoaded = 'true';
        resolve();
      } else {
        script.remove();
        reject(new Error('google_identity_unavailable'));
      }
    };
    const onError = () => {
      cleanup();
      script.remove();
      reject(new Error('google_identity_load_failed'));
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.vuxoGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  });

  // Never cache a rejected SDK promise: retry must load a fresh script.
  googleScriptPromise = load.catch(error => {
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

export function GoogleSignInButton({
  clientId,
  disabled,
  onCredential,
  onError,
}: {
  clientId: string;
  disabled: boolean;
  onCredential: (credential: string) => void;
  onError: () => void;
}) {
  const { t, i18n } = useTranslation('auth');
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;
  const useE2eCredential = import.meta.env.VITE_E2E_AUTH === 'true' && !window.__vuxoE2ERealGoogleSdk;
  const [sdkState, setSdkState] = useState<'loading' | 'ready' | 'failed'>(useE2eCredential ? 'ready' : 'loading');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (useE2eCredential || !containerRef.current) return;

    let active = true;
    let onGoogleResponse: ((response: GoogleCredentialResponse) => void) | null = null;
    const container = containerRef.current;
    container.replaceChildren();
    setSdkState('loading');

    void loadGoogleIdentityServices()
      .then(() => {
        if (!active) return;
        const identity = window.google?.accounts?.id;
        if (!identity) throw new Error('google_identity_unavailable');

        onGoogleResponse = response => {
          if (response.credential) onCredentialRef.current(response.credential);
          else onErrorRef.current();
        };
        activeGoogleCredentialHandler = onGoogleResponse;

        // Google documents initialize() as a one-time operation. Re-rendering
        // or switching the page language must not reset global GIS state.
        if (initializedGoogleClientId !== clientId) {
          identity.initialize({
            client_id: clientId,
            auto_select: false,
            callback: response => activeGoogleCredentialHandler?.(response),
          });
          initializedGoogleClientId = clientId;
        }
        identity.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280,
          locale: i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it',
        });
        setSdkState('ready');
      })
      .catch(() => {
        if (!active) return;
        // Loading the SDK is not an OAuth credential failure.
        setSdkState('failed');
      });

    return () => {
      active = false;
      if (activeGoogleCredentialHandler === onGoogleResponse) {
        activeGoogleCredentialHandler = null;
      }
      container.replaceChildren();
    };
  }, [clientId, i18n.resolvedLanguage, retryVersion, useE2eCredential]);

  if (useE2eCredential) {
    return (
      <Button
        data-testid="auth-google"
        variant="outlined"
        size="large"
        disabled={disabled}
        onClick={() => onCredential('e2e-google-id-token')}
      >
        {t('google')}
      </Button>
    );
  }

  return (
    <Box data-testid="auth-google" sx={{ minHeight: 44 }}>
      {sdkState === 'loading' ? <CircularProgress size={28} aria-label={t('loadingProvider')} /> : null}
      {sdkState === 'failed' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}>
          <Box component="p" role="alert" data-testid="auth-google-sdk-error" sx={{ m: 0, color: 'text.secondary' }}>
            {t('googleSdkUnavailable')}
          </Box>
          <Button
            data-testid="auth-google-sdk-retry"
            variant="outlined"
            disabled={disabled}
            onClick={() => setRetryVersion(version => version + 1)}
          >
            {t('retryGoogleSdk')}
          </Button>
        </Box>
      ) : null}
      <Box ref={containerRef} sx={{ display: sdkState === 'ready' && !disabled ? 'block' : 'none' }} />
    </Box>
  );
}
