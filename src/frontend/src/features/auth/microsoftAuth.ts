import {
  BrowserCacheLocation,
  PublicClientApplication,
} from '@azure/msal-browser';

export type MicrosoftLoginConfiguration = {
  clientId: string;
  tenantId: string;
};

type PreparedMicrosoftApplication = {
  key: string;
  application: PublicClientApplication;
  initialization: Promise<void>;
  ready: boolean;
};

let preparedMicrosoftApplication: PreparedMicrosoftApplication | null = null;

function configurationKey(configuration: MicrosoftLoginConfiguration): string {
  return JSON.stringify([
    configuration.clientId,
    configuration.tenantId,
    window.location.origin,
    import.meta.env.BASE_URL,
  ]);
}

/**
 * Initialize MSAL before the user clicks Sign in.
 * Waiting for initialize() in the click handler can lose browser user
 * activation, causing Chrome to silently block loginPopup().
 */
export function prepareMicrosoftLogin(configuration: MicrosoftLoginConfiguration): Promise<void> {
  if (import.meta.env.VITE_E2E_AUTH === 'true') return Promise.resolve();

  const key = configurationKey(configuration);
  if (preparedMicrosoftApplication?.key === key) {
    return preparedMicrosoftApplication.initialization;
  }

  const application = new PublicClientApplication({
    auth: {
      clientId: configuration.clientId,
      authority: `https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}`,
      redirectUri: new URL(`${import.meta.env.BASE_URL}redirect.html`, window.location.origin).toString(),
    },
    cache: {
      cacheLocation: BrowserCacheLocation.MemoryStorage,
    },
    system: {
      // Open a blank popup immediately on the user's gesture, then navigate it.
      navigatePopups: true,
    },
  });

  const entry: PreparedMicrosoftApplication = {
    key,
    application,
    ready: false,
    initialization: Promise.resolve(),
  };
  preparedMicrosoftApplication = entry;
  entry.initialization = application.initialize()
    .then(() => { entry.ready = true; })
    .catch(error => {
      if (preparedMicrosoftApplication === entry) {
        preparedMicrosoftApplication = null;
      }
      throw error;
    });
  return entry.initialization;
}

/** Call directly from the user click handler, without awaiting anything first. */
export function acquireMicrosoftIdToken(
  configuration: MicrosoftLoginConfiguration,
): Promise<string> {
  if (import.meta.env.VITE_E2E_AUTH === 'true') {
    return Promise.resolve('e2e-microsoft-id-token');
  }

  const entry = preparedMicrosoftApplication;
  if (!entry || !entry.ready || entry.key !== configurationKey(configuration)) {
    return Promise.reject(new Error('microsoft_auth_not_ready'));
  }

  // This call must happen synchronously as part of the button click.
  return entry.application.loginPopup({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account',
  }).then(response => {
    if (!response.idToken) {
      throw new Error('microsoft_id_token_missing');
    }
    return response.idToken;
  });
}

/** Do not expose provider tokens or raw MSAL error details in the UI. */
export function getMicrosoftLoginErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'errorCode' in error
    && typeof error.errorCode === 'string'
    ? error.errorCode
    : '';

  if (code === 'popup_window_error' || code === 'empty_window_error') {
    return 'microsoft_popup_blocked';
  }
  if (code === 'interaction_in_progress') {
    return 'microsoft_login_in_progress';
  }
  if (code === 'user_cancelled') {
    return 'social_login_cancelled';
  }
  if (error instanceof Error && error.message === 'microsoft_auth_not_ready') {
    return 'social_provider_unavailable';
  }
  return 'social_login_failed';
}
