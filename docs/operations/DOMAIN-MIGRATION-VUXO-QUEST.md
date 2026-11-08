# VUXO production domain migration — vuxo.quest

**Document ID:** VUXO-OPS-DOMAIN-001  
**Date:** 2026-11-08  
**Status:** Migration in progress; external provider configuration requires administrator action.  
**Style:** Controlled technical English, based on ASD-STE100 principles. Not a formal STE100 certification.  
**Issues:** [#130](https://github.com/KeyserDSoze/Vuxo/issues/130), [#121](https://github.com/KeyserDSoze/Vuxo/issues/121)

## 1. Purpose

Use **`https://vuxo.quest`** for the production web application.
Use **`https://api.vuxoapi.xyz`** for the production API.
The earlier `https://vuxo.app` web origin is no longer authoritative.
Do not enable wildcard CORS or send provider credentials to the API as URL parameters.

## 2. Confirm GitHub Pages

1. Open [repository Pages settings](https://github.com/KeyserDSoze/Vuxo/settings/pages).
2. Confirm **Source** is **GitHub Actions**.
3. Confirm **Custom domain** is exactly **`vuxo.quest`**.
4. Save the domain if it is different.
5. Confirm DNS records for the apex domain point to GitHub Pages as specified in the GitHub Pages settings.
6. Confirm HTTPS is enabled.
7. Open `https://vuxo.quest/version.json`.
8. Compare its `commit` with the successful Pages deployment commit.
9. Open `https://vuxo.quest/redirect.html`. Confirm it is the standalone Microsoft redirect bridge.

**NOTE:** For GitHub Actions-based Pages publishing, a `CNAME` file does not set the custom domain. Set the custom domain in repository Pages settings.

## 3. Confirm Microsoft Entra ID

1. Open [Microsoft Entra](https://entra.microsoft.com).
2. Go to **App registrations**.
3. Select the existing VUXO application (use the client ID already configured in GitHub).
4. Open **Authentication**.
5. Under **Single-page application**, add **`https://vuxo.quest/redirect.html`**.
6. Remove `https://vuxo.app/redirect.html` when the old domain is no longer required.
7. Save the changes.
8. Do not create a new client secret. Do not enable implicit grant.
9. Keep the existing tenant selector if it matches the users you want to admit. To support personal Microsoft accounts and work/school accounts, select the matching multi-account audience and use `common`. A tenant GUID restricts access to that tenant.

**CAUTION:** The Microsoft redirect URI must match exactly. Do not use the API domain for the redirect.
**NOTE:** MSAL v5 popup login requires the redirect bridge page. Do not set Cross-Origin-Opener-Policy on that page.

## 4. Confirm Google Cloud

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/clients).
2. Select the existing VUXO Web application OAuth client.
3. Add **`https://vuxo.quest`** under **Authorized JavaScript origins**.
4. Remove `https://vuxo.app` when the old domain is retired.
5. Save the changes.
6. For this Google Identity Services callback implementation, do not add a new redirect URI.
7. If the OAuth app is in Testing, add the intended test accounts under **Audience → Test users**.
8. Complete required production publishing, branding and verification when you open the application to the public.

**CAUTION:** Do not put a path or trailing slash in the authorized JavaScript origin.
**NOTE:** You can reuse the existing Google Client ID. No new Google secret is required for the current GIS login-only flow.

## 5. GitHub Variables

1. Open [GitHub production environment](https://github.com/KeyserDSoze/Vuxo/settings/environments).
2. Open `production`.
3. Update **`VUXO_ALLOWED_ORIGIN`** to **`https://vuxo.quest`**.
4. Keep your existing `VUXO_GOOGLE_CLIENT_ID`, `VUXO_MICROSOFT_CLIENT_ID` and `VUXO_MICROSOFT_TENANT_ID` values unless a provider registration changed.
5. Do not put these values in repository source files.
6. Keep JWT, PostgreSQL and Cloudflare secrets in GitHub Environment secrets.

**NOTE:** The Pi deploy workflow now fixes the canonical origin to `https://vuxo.quest` at deploy time, to prevent an obsolete GitHub environment variable from reintroducing the CORS regression. Update the stored variable for consistency; it is not the source of truth for the Pi workflow.

## 6. Deploy

1. Merge the reviewed domain migration PR after CI and real-browser/API test suites pass.
2. Confirm GitHub Pages deploy succeeds for the merged `main` commit.
3. Confirm `Deploy VUXO to Raspberry Pi 3 ARM64` completes `build-arm64` and `deploy-pi3`.
4. Confirm the Pi preflight, backup and local API provider/CORS verification all pass.
5. Confirm the separate public OAuth smoke passes or investigate the external network path.
6. Do not run `docker compose down -v`. Do not reset PostgreSQL or Redis.

## 7. Verify production

Run these commands from a computer outside your Raspberry LAN:

```bash
curl -i https://api.vuxoapi.xyz/health
curl -i -H 'Origin: https://vuxo.quest' https://api.vuxoapi.xyz/api/auth/providers
curl -i -X OPTIONS https://api.vuxoapi.xyz/api/auth/social \
  -H 'Origin: https://vuxo.quest' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
curl -i https://vuxo.quest/redirect.html
```

The `/api/auth/providers` response must be HTTP 200 JSON and include:

- `Access-Control-Allow-Origin: https://vuxo.quest`
- `Access-Control-Allow-Credentials: true`
- `microsoft.enabled: true`
- `google.enabled: true`

The `OPTIONS` response must authorize POST and Content-Type for this origin.
A request with `Origin: https://vuxo.app` must **not** receive an allow-origin header for that legacy origin.

Open `https://vuxo.quest/#/auth` in a private browser session.
Check the Microsoft and Google buttons, then complete **real** authentication using one account for each provider.

Do not mark issue #130 or #121 complete from `/health` alone.

## 8. External references

- [GitHub Pages custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [MSAL Browser v5 redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [Google Identity Services web client](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
