# Social authentication

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

- production: `https://vuxo.quest/`
- local development: `http://localhost:5173/` (only when used locally)

Choose the account audience that matches the server tenant configuration:
- `common`: organizational directories + personal Microsoft accounts;
- `organizations`: organizational directories only;
- `consumers`: personal Microsoft accounts only;
- a tenant GUID: that exact tenant only.

Set on the server:

```env
VUXO_MICROSOFT_CLIENT_ID=<public application/client id>
VUXO_MICROSOFT_TENANT_ID=common
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
- `VUXO_MICROSOFT_TENANT_ID` (default `common`);
- `VUXO_GOOGLE_CLIENT_ID`;
- optionally `VUXO_JWT_LIFETIME_MINUTES` (default `480`).

These values are public application configuration, not provider client secrets. Existing sensitive values such as `VUXO_JWT_SIGNING_KEY`, PostgreSQL password and Cloudflare tunnel token remain GitHub Environment **Secrets**.
