# Social authentication

**Step-by-step production setup (STE-style):** [LOGIN-GOOGLE-MICROSOFT-STE100.md](LOGIN-GOOGLE-MICROSOFT-STE100.md). This guide lists the exact Google and Microsoft console steps, GitHub variable scopes, production deployment and sign-in tests.

Vuxo 0.0.1 supports Microsoft and Google login while keeping an internal Vuxo identity independent from either provider.

## Security model

- Microsoft uses MSAL Browser and Authorization Code + PKCE for the SPA. No client secret is shipped to the browser.
- Google uses Google Identity Services Sign in with Google for login-only `openid/email/profile`; no Google API scope is requested.
- The provider ID token is sent to `POST /api/auth/social` only for verification and is never persisted as the permanent Vuxo identity.
- The backend validates signature, issuer/tenant, audience and expiration, then maps `provider + subject` to an internal `VuxoUserId`.
- REST and SignalR use the Vuxo JWT issued after verification.
- Social login is rate-limited per source IP.
- Audit events contain provider/result metadata but never provider credentials or token subjects.

## Microsoft Entra registration

Create/register a Single-page application and configure the SPA redirect URIs:

- production: `https://vuxo.quest/redirect.html`
- local development with `VITE_BASE_PATH=/`: `http://localhost:5173/redirect.html` (only when used locally; when using the repository default `/Vuxo/` base, use `http://localhost:5173/Vuxo/redirect.html` instead)

**VUXO production policy: Microsoft personal accounts only.** Keep the Entra app audience set to `PersonalMicrosoftAccount` and the GitHub `production` environment variable `VUXO_MICROSOFT_TENANT_ID=consumers`. Organizational or school Microsoft accounts are not accepted. The other tenant modes below are documented for reference only; do not use them for VUXO production without a policy decision.

Choose the account audience that matches the server tenant configuration:
- `common`: organizational directories + personal Microsoft accounts;
- `organizations`: organizational directories only;
- `consumers`: personal Microsoft accounts only;
- a tenant GUID: that exact tenant only.

MSAL Browser v5 uses a dedicated Vite-built redirect bridge at `src/frontend/redirect.html`, emitted as `/redirect.html` on the production custom domain. Register the **exact** redirect URI under the **Single-page application** platform in Microsoft Entra, not Web, and use Authorization Code + PKCE without a client secret. The popup returns the ID token to Vuxo's browser app through this bridge, then `/api/auth/social` validates it server-side. Do not enable legacy implicit flows. The bridge page must not include other app scripts or COOP response headers.

Set on the server:

```env
VUXO_MICROSOFT_CLIENT_ID=<public application/client id>
VUXO_MICROSOFT_TENANT_ID=consumers
```

## Google registration

Create a Web OAuth client for Google Identity Services and add authorized JavaScript origins:

- production: `https://vuxo.quest`
- local development: `http://localhost:5173`

Set on the server:

```env
VUXO_GOOGLE_CLIENT_ID=<public web client id>
```

The client ID is public configuration; no Google client secret is required by the Vuxo login-only GIS flow.

## Vuxo session

The API returns a Vuxo JWT with the internal user GUID as subject. Default lifetime is 480 minutes and can be changed with:

```env
VUXO_JWT_LIFETIME_MINUTES=480
```

The SPA stores only the Vuxo access token plus non-sensitive Vuxo user/session metadata. Microsoft SDK cache is configured in memory; the Google ID token is used only for the immediate exchange.

`POST /api/auth/logout` is authenticated but Vuxo 0.0.1 uses stateless JWTs: logout means discarding the local Vuxo token. An already issued token remains cryptographically valid until expiration; server-side revocation/refresh-session storage is intentionally outside this release.

## Public provider configuration

`GET /api/auth/providers` exposes only enabled flags plus public Microsoft/Google client IDs and Microsoft tenant selector. Secrets are never returned.

## Production CORS

The existing production origin remains `https://vuxo.quest`. The API continues to be reached through `https://api.vuxoapi.xyz`/Cloudflare Tunnel; no provider callback is sent to the API domain because Microsoft/GIS authenticate in the SPA and the backend only verifies the resulting ID token.


## GitHub deploy configuration

For the self-hosted production workflow, configure these **Environment Variables** on GitHub Environment `production`:

- `VUXO_MICROSOFT_CLIENT_ID`;
- `VUXO_MICROSOFT_TENANT_ID` (production value `consumers`; fallback without variable is `common`, so always set it explicitly);
- `VUXO_GOOGLE_CLIENT_ID`;
- optionally `VUXO_JWT_LIFETIME_MINUTES` (default `480`).

These values are public application configuration, not provider client secrets. The ARM64 workflow reads them when the production deploy job runs; updating GitHub variables alone does **not** change a currently running API. Trigger a new verified green-main deployment after the Entra registration and confirm `GET https://api.vuxoapi.xyz/api/auth/providers` exposes the new client ID. The Pages workflow must publish a bundle built with `VITE_API_BASE_URL=https://api.vuxoapi.xyz`; older Pages builds may still point at `127.0.0.1:8080` and display a provider configuration network error. If the provider endpoint returns HTTP 200 with both providers disabled, that is a different state from a transport/CORS error. Existing sensitive values such as `VUXO_JWT_SIGNING_KEY`, PostgreSQL password and Cloudflare tunnel token remain GitHub Environment **Secrets**.

**Google origin troubleshooting:** when Chrome reports `GSI_LOGGER: The given origin is not allowed for the given client ID`, open the Google Auth Platform OAuth **Web application** client matching the public `VUXO_GOOGLE_CLIENT_ID` and add exactly `https://vuxo.quest` under **Authorized JavaScript origins**. This requires Google Cloud project access and cannot be solved by CORS headers or a backend deploy. After saving, retest in a private window. `google.accounts.id.initialize()` should be invoked only once per client ID per page lifecycle.
