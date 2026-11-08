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

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-vuxo-google-identity]');
    const script = existing ?? document.createElement('script');

    const onLoad = () => window.google?.accounts?.id
      ? resolve()
      : reject(new Error('google_identity_unavailable'));
    const onError = () => reject(new Error('google_identity_load_failed'));

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.vuxoGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
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
  const [loadingSdk, setLoadingSdk] = useState(import.meta.env.VITE_E2E_AUTH !== 'true');

  useEffect(() => {
    if (import.meta.env.VITE_E2E_AUTH === 'true' || !containerRef.current) return;

    let active = true;
    let onGoogleResponse: ((response: GoogleCredentialResponse) => void) | null = null;
    const container = containerRef.current;
    container.replaceChildren();

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
        setLoadingSdk(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadingSdk(false);
        onErrorRef.current();
      });

    return () => {
      active = false;
      if (activeGoogleCredentialHandler === onGoogleResponse) {
        activeGoogleCredentialHandler = null;
      }
      container.replaceChildren();
    };
  }, [clientId, i18n.resolvedLanguage]);

  if (import.meta.env.VITE_E2E_AUTH === 'true') {
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
    <Box data-testid="auth-google" sx={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
      {loadingSdk ? <CircularProgress size={28} aria-label={t('loadingProvider')} /> : null}
      <Box ref={containerRef} sx={{ display: disabled ? 'none' : 'block' }} />
    </Box>
  );
}
