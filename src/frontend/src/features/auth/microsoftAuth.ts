import {
  BrowserCacheLocation,
  PublicClientApplication,
} from '@azure/msal-browser';

export type MicrosoftLoginConfiguration = {
  clientId: string;
  tenantId: string;
};

export async function acquireMicrosoftIdToken(
  configuration: MicrosoftLoginConfiguration,
): Promise<string> {
  if (import.meta.env.VITE_E2E_AUTH === 'true') {
    return 'e2e-microsoft-id-token';
  }

  const application = new PublicClientApplication({
    auth: {
      clientId: configuration.clientId,
      authority: `https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}`,
      redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.MemoryStorage,
    },
  });

  await application.initialize();
  const response = await application.loginPopup({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account',
  });

  if (!response.idToken) {
    throw new Error('microsoft_id_token_missing');
  }

  return response.idToken;
}
