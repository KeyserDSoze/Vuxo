# VUXO 0.0.1 — Set up Google and Microsoft sign-in

**Document ID:** VUXO-OPS-AUTH-001  
**Revision:** 3  
**Date:** 2026-11-08  
**Scope:** Production sign-in for `https://vuxo.quest`  
**Writing method:** Controlled technical English based on ASD-STE100 Issue 9. **Not formally STE-certified.**  
**Related issues:** [#121](https://github.com/KeyserDSoze/Vuxo/issues/121), [#130](https://github.com/KeyserDSoze/Vuxo/issues/130)

## 1. Purpose

Use this procedure to enable Microsoft and Google sign-in for VUXO production.

The frontend uses Microsoft MSAL Browser v5 and Google Identity Services.
The frontend sends an identity token to the VUXO API.
The API verifies this token and creates a VUXO session.
You do not need a new API server or an additional Docker container.

## 2. Required access

Before you start, make sure that you have the following access:

- A Microsoft Entra directory that permits application registrations.
- A Google Cloud project that you can configure.
- GitHub repository settings access for `KeyserDSoze/Vuxo`.
- Access to GitHub Actions.
- Access to `https://vuxo.quest` and `https://api.vuxoapi.xyz`.
- A test Microsoft account.
- A test Google account.

**CAUTION:** Do not put provider tokens, client secrets, or passwords in a source file.
**CAUTION:** Do not put a secret in a GitHub issue or a workflow log.
**CAUTION:** Use `https://vuxo.quest` as the production frontend origin. Do not use the former `vuxo.app` address.
**NOTE:** Microsoft and Google client IDs are public identifiers. They are not secret credentials.
**NOTE:** This VUXO sign-in implementation does not use a Microsoft or Google client secret.

## 3. Register Microsoft

### 3.1 Create the application

1. Open `https://entra.microsoft.com`.
2. Sign in with an account that can register applications.
3. Open **Entra ID**.
4. Open **App registrations**.
5. Select **New registration**.
6. Enter `VUXO - Production` in the **Name** field.
7. Select **Personal Microsoft accounts only**.
8. Select **Register**.
9. Open the new application's **Overview** page.
10. Copy **Application (client) ID**.
11. Store this ID in your secure deployment notes.

**NOTE:** Do not use **Directory (tenant) ID** as the application client ID.
**NOTE:** Keep the existing Microsoft Client ID; change only the tenant selector from an organizational GUID to `consumers` in the GitHub production environment. Run a new verified deployment before testing again.
**NOTE:** VUXO is configured for consumer-only Microsoft sign-in. Set the audience to `PersonalMicrosoftAccount` and the VUXO tenant selector to `consumers`. Do not select an organizational directory.

### 3.2 Add the SPA redirect

1. Open **Authentication** for the application.
2. Select **Add a platform**.
3. Select **Single-page application (SPA)**.
4. Enter the production redirect URI:

   `https://vuxo.quest/redirect.html`

5. Select **Configure** or **Save**.
6. Confirm that the new URI appears under the SPA platform.
7. Do not add this URI under the **Web** platform.
8. Do not enable legacy implicit grant settings.

**NOTE:** The URI must match exactly. It includes the path `/redirect.html`.
**NOTE:** MSAL Browser v5 uses this separate page to complete popup sign-in.
**NOTE:** Do not use `https://api.vuxoapi.xyz` as the Microsoft redirect URI.

### 3.3 Optional local tests

Use this step only if you run the frontend on your development computer.

1. Open the same **Single-page application** configuration.
2. Add `http://localhost:5173/Vuxo/redirect.html` for the repository's default Vite base.
3. Alternatively, add `http://localhost:5173/redirect.html` if you set `VITE_BASE_PATH=/`.
4. Save the configuration.

**NOTE:** Local redirect URIs have a path. Their paths depend on the frontend base configuration.

### 3.4 Check permissions

1. Open **API permissions**.
2. Review the existing permissions.
3. Do not add Microsoft Graph permissions for the basic VUXO login.
4. Do not create a client secret.
5. Keep the VUXO sign-in scopes limited to `openid`, `profile`, and `email`.

**Result:** You have a Microsoft Application (client) ID and a registered SPA redirect.

## 4. Register Google

### 4.1 Create the Google project

1. Open `https://console.cloud.google.com`.
2. Sign in to your Google account.
3. Select an existing project or create `VUXO Production`.
4. Open **Google Auth Platform**.
5. Open **Branding**.
6. Enter `VUXO` as the application name.
7. Add a user support email.
8. Add a developer contact email.
9. Set the application home page to `https://vuxo.quest`.
10. Set the authorized domain to `vuxo.quest`.
11. Add your public privacy policy URL when Google requests it.
12. Save the branding data.

**CAUTION:** Do not enter a privacy policy URL that does not exist.
**NOTE:** Google can require domain ownership and brand verification for public production sign-in.
**NOTE:** Verify the `vuxo.quest` domain through Google Search Console when required.
**NOTE:** A public privacy policy must describe how VUXO uses Google account data.

### 4.2 Configure the audience

1. Open **Google Auth Platform → Audience**.
2. Select **External** if you want to support public Google accounts.
3. Select **Testing** during the initial configuration, if this option is available.
4. Add your Google account to **Test users**.
5. Save the audience settings.

**NOTE:** An app in Testing can restrict sign-in to listed test users.
**NOTE:** For a public launch, configure the production publishing status and finish required brand verification.

### 4.3 Configure the data access

1. Open **Google Auth Platform → Data Access**.
2. Review the configured scopes.
3. Use the basic sign-in scopes: `openid`, `email`, and `profile`.
4. Do not add Gmail, Drive, Calendar, or other Google API scopes.
5. Save the settings.

**NOTE:** VUXO currently uses Google only to establish user identity.

### 4.4 Create the OAuth client

1. Open **Google Auth Platform → Clients**.
2. Select **Create client**.
3. Select **Web application** as the application type.
4. Enter `VUXO Web Production` as the client name.
5. Add this **Authorized JavaScript origin**:

   `https://vuxo.quest`

6. Add `http://localhost:5173` only if you use local development.
7. Leave **Authorized redirect URIs** empty for the current JavaScript callback flow.
8. Create the client.
9. Copy the **Client ID**.

**NOTE:** The Google Client ID usually ends with `.apps.googleusercontent.com`.
**NOTE:** Google can show a client secret. VUXO does not use that secret.
**NOTE:** JavaScript origins do not include the path `/auth` or a final slash.

**Result:** You have a Google Web application Client ID.

## 5. Set the GitHub production variables

### 5.1 Open the correct environment

1. Open `https://github.com/KeyserDSoze/Vuxo/settings/environments`.
2. Select the environment named `production`.
3. Find **Environment variables**.
4. Create or update these values:

| Variable | Value | Storage |
|---|---|---|
| `VUXO_MICROSOFT_CLIENT_ID` | Microsoft Application (client) ID | Environment variable |
| `VUXO_MICROSOFT_TENANT_ID` | `consumers` | Environment variable |
| `VUXO_GOOGLE_CLIENT_ID` | Google Web application Client ID | Environment variable |
| `VUXO_ALLOWED_ORIGIN` | `https://vuxo.quest` | Environment variable |

5. Confirm that all four entries appear under the `production` environment.
6. Do not create these four entries as client secrets.

### 5.2 Check the existing secrets

1. Open **Environment secrets** in `production`.
2. Confirm that `VUXO_POSTGRES_PASSWORD` exists.
3. Confirm that `VUXO_JWT_SIGNING_KEY` exists.
4. Confirm that `VUXO_CLOUDFLARE_TUNNEL_TOKEN` exists.
5. Do not copy the secret values to this guide.

**NOTE:** GitHub does not show saved secret values. A saved secret name is not a secret-value test.

### 5.3 Check repository variables

1. Open `https://github.com/KeyserDSoze/Vuxo/settings/variables/actions`.
2. Open the **Variables** section.
3. Check `VUXO_PI3_DEPLOY_ENABLED`.
4. Keep this value `true` only when the Raspberry is approved for production deployment.
5. Check `VUXO_API_BASE_URL`, if this variable exists.
6. Set `VUXO_API_BASE_URL` to `https://api.vuxoapi.xyz` if necessary.

**NOTE:** The Pages workflow already uses `https://api.vuxoapi.xyz` when `VUXO_API_BASE_URL` is absent.
**NOTE:** `VUXO_API_BASE_URL` is a **repository-level Actions variable** for the Pages build.
**NOTE:** The three provider settings above are **environment-level variables** for the Raspberry deploy.

## 6. Apply the variables to the Raspberry API

GitHub saves the variables. GitHub does not automatically restart a running API when you edit them.

1. Open `https://github.com/KeyserDSoze/Vuxo/actions`.
2. Open **Deploy VUXO to Raspberry Pi 3 ARM64**.
3. Find the most recent successful deployment for the current `main` commit.
4. Confirm that the deployment commit is equal to the current `main` commit.
5. Select **Re-run all jobs** for this run, if GitHub offers this option.
6. If GitHub does not offer this action, use the next reviewed push to `main`.
7. Confirm that the required `main` CI is successful.
8. Confirm that the ARM64 image build is successful.
9. Confirm that the Raspberry `preflight` step is successful.
10. Confirm that **Deploy, backup and verify** is successful.
11. Do not use `docker compose down -v`.

**CAUTION:** Do not bypass the Pi preflight, backup, or health check.
**CAUTION:** If the current `main` commit differs from the rerun commit, do not deploy an old revision.
**NOTE:** This workflow does not have a `workflow_dispatch` trigger.
**NOTE:** VUXO production enforces the Microsoft `consumers` tenant in the Pi and legacy server workflows. Update the GitHub `production` variable to `consumers` for consistency, but a stale tenant GUID is never passed into the running API. The Pi preflight and public smoke reject a tenant other than `consumers`.

**NOTE:** The Pi job reads the production variables when the deployment job starts.
**NOTE:** A successful CI on a pull request does not deploy production.
**NOTE:** The pipeline writes a temporary private environment file. It does not commit the values.
**NOTE:** The deploy creates a PostgreSQL backup before it replaces the API container.

### 6.1 Automated provider check (deployment update pending review)

The proposed Pi deployment gate checks the Google and Microsoft configuration before it changes any container. If either client ID or the production origin is missing or malformed, the job stops before updating the API.

After the API starts, the gate compares the public `/api/auth/providers` response with the expected client IDs and checks CORS for `https://vuxo.quest`. It does not print client IDs or read provider tokens. A failed check reports a failed job, but it does not delete Docker volumes or roll back an EF migration.

**NOTE:** The gate requires both providers on the production Pi. It applies only after its pull request is reviewed and merged. It does not prove that a Microsoft or Google user can finish sign-in in a browser.

### 6.2 Verify the public network path after deployment (proposed PR)

After the Raspberry deploy passes, a separate GitHub-hosted runner checks the external API and frontend. It checks the following items without a user login:

1. `https://api.vuxoapi.xyz/health` returns `Healthy`.
2. `/api/meta/version` reports the same immutable commit that the deployment built.
3. `/api/auth/providers` enables both Google and Microsoft and permits the `https://vuxo.quest` origin.
4. An `OPTIONS` preflight to `/api/auth/social` permits the JSON `POST` from that origin.
5. `https://vuxo.quest/redirect.html` serves the separate Microsoft MSAL v5 script.

The probe uses five attempts with short delays. It does not send provider tokens, change data or perform real sign-in. If the probe fails, the workflow is not successful. The API containers and data volumes remain unchanged by this probe.

**NOTE:** This external check applies only after its pull request is merged. Successful checks do not replace the browser sign-in tests in section 8.

## 7. Verify public configuration

Use a computer outside the Raspberry network.

1. Verify the core health endpoint:

   ```bash
   curl -i https://api.vuxoapi.xyz/health
   ```

2. Confirm that the result is HTTP 200 with body `Healthy`.
3. Verify the provider configuration:

   ```bash
   curl -i https://api.vuxoapi.xyz/api/auth/providers
   ```

4. Confirm that `microsoft.enabled` is `true`.
5. Confirm that `google.enabled` is `true`.
6. Confirm that the returned Microsoft Client ID matches your registration.
7. Confirm that the returned Google Client ID matches your registration.
8. Check the CORS response:

   ```bash
   curl -i -H "Origin: https://vuxo.quest" https://api.vuxoapi.xyz/api/auth/providers
   ```

9. Confirm that `Access-Control-Allow-Origin` allows `https://vuxo.quest`.
10. Verify the Microsoft bridge:

   ```bash
   curl -i https://vuxo.quest/redirect.html
   ```

11. Confirm that the redirect page returns HTTP 200.
12. Confirm that the page is the dedicated Microsoft bridge, not the VUXO application home page.

**NOTE:** The provider endpoint returns public IDs. It does not expose passwords or tokens.
**NOTE:** HTTP 200 on `/health` does not prove that external sign-in succeeds.

## 8. Test the real sign-in

1. Open `https://vuxo.quest` in a private browser window.
2. Open the **Account** page.
3. Confirm that **Sign in with Microsoft** appears.
4. Select the Microsoft sign-in button.
5. Sign in with the Microsoft test account.
6. Confirm that the popup returns control to VUXO.
7. Confirm that VUXO displays the signed-in user's account.
8. Sign out from VUXO.
9. Confirm that the sign-in buttons appear again.
10. Select **Sign in with Google**.
11. Sign in with a Google test account.
12. Confirm that VUXO displays the Google account's user session.
13. Sign out from VUXO.
14. Check that your browser does not expose any application client secret.

**NOTE:** VUXO creates its own JWT after the backend verifies a provider ID token.
**NOTE:** Google and Microsoft identities are separate until the application implements an account-linking feature.
**NOTE:** Do not paste authentication tokens into GitHub issues, chat messages, or public support reports.

## 9. Fault isolation

| Symptom | Probable cause | Corrective step |
|---|---|---|
| Provider configuration is unavailable | Frontend network or CORS error | Check browser Network and `VUXO_API_BASE_URL`. |
| Provider endpoint returns HTTP 200, with `enabled: false` | Client ID is absent in the running API | Check production environment variables. Redeploy the API. |
| Microsoft returns a redirect URI mismatch | Incorrect SPA redirect | Set `https://vuxo.quest/redirect.html` under SPA. |
| Microsoft popup does not complete | Bridge page missing or blocked | Check `/redirect.html` and COOP headers. |
| Google returns `origin_mismatch` | Incorrect JavaScript origin | Set `https://vuxo.quest` without a path. |
| Google restricts test users | OAuth app is in Testing | Add the test user or complete production publishing. |
| VUXO returns HTTP 401 after provider login | Token validation failed | Check audience/client ID, tenant and server logs. |
| VUXO cannot reach the API | Old frontend origin or tunnel issue | Check `/health` and `/api/auth/providers` from outside. |

## 10. Completion record

- [ ] Microsoft Entra SPA is registered.
- [ ] Microsoft SPA redirect URI is correct.
- [ ] Google Web client is registered.
- [ ] Google JavaScript origin is correct.
- [ ] Google test-user and production-publishing status are known.
- [ ] GitHub `production` variables contain both client IDs.
- [ ] Production deploy completes successfully.
- [ ] `/api/auth/providers` returns both providers enabled.
- [ ] The CORS header permits `https://vuxo.quest`.
- [ ] Microsoft sign-in works in the browser.
- [ ] Google sign-in works in the browser.
- [ ] VUXO login and logout work for both providers.

Keep [issue #121](https://github.com/KeyserDSoze/Vuxo/issues/121) open until both production sign-ins pass.

## Official references

- [ASD-STE100](https://www.asd-ste100.org/) — current Issue 9.
- [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).
- [Microsoft MSAL Browser redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge).
- [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
- [Google branding and verification](https://developers.google.com/identity/verification/authentication-policy-compliance).
- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
