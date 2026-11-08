/**
 * Keep the MSAL v5 popup bridge on the current SPA origin. Vite supplies the
 * deployment base path; the Entra registration must match this exact URL.
 * Never redirect OAuth responses to an external asset/CDN origin.
 */
export function microsoftPopupRedirectUri(baseUrl: string, origin: string): string {
  const currentOrigin = new URL(origin);
  if (!['http:', 'https:'].includes(currentOrigin.protocol))
    throw new Error('microsoft_redirect_invalid_origin');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const redirect = new URL(`${base}redirect.html`, currentOrigin.origin);
  if (redirect.origin !== currentOrigin.origin || redirect.search || redirect.hash)
    throw new Error('microsoft_redirect_origin_mismatch');
  return redirect.toString();
}
