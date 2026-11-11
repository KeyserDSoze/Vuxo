# Cloudflare public API: repeatable read-only edge sampling

Related issues: [#147](https://github.com/KeyserDSoZe/Vuxo/issues/147) (intermittent public HTTP 502, **Blocked**), [#188](https://github.com/KeyserDSoZe/Vuxo/issues/188) (safe sampling workflow), [#59](https://github.com/KeyserDSoZe/Vuxo/issues/59) (Raspberry production).

## What it tests — no credentials

Use **GitHub → Actions → Public API edge sampling (read-only) → Run workflow → main**. This workflow also runs **only when its own workflow or scripts change**, never on a timer; Actions quota/billing investigation #168 is still open.

A hosted Ubuntu runner performs **3 rounds** separated by 5 seconds over 9 fixed, anonymous requests against canonical endpoints `https://api.vuxoapi.xyz` and `https://vuxo.quest`:
- API `/health`, `/api/meta/version`, `/api/auth/providers`: expected **HTTP 200**.
- API `OPTIONS /api/auth/social`: expected **HTTP 200/204**.
- API `GET /api/personal-content/history/completed` and `/outcomes`: expected **HTTP 401** without Authorization/cookies.
- API `OPTIONS` for the same two history routes: expected **HTTP 200/204**.
- Web `/redirect.html`: expected **HTTP 200** (the redirect bridge, not a real Microsoft sign-in).

The tool is deliberately **red if ANY observation has an unexpected status or transport failure**; no retry can turn a failing round green. It reports only fixed endpoint labels, numeric statuses, safe transport categories, `cloudflare`/other server class and *validated three-letter* POP suffix. Artifact `vuxo-public-edge-evidence` contains the same sanitized information for seven days. No credentials, upstream bodies, provider Client IDs, JWT, cookies, IPs, full CF-Ray request identifiers or raw response headers are logged. This script never updates the API or tunnel.

This is an **observation tool**, not the deployment gate. The strict `scripts/verify-public-auth.mjs` gate still checks deployed commit, CORS, enabled providers and consumer-only Microsoft, private 401 and the browser redirect bridge.

## Evidence collected — 11 November 2026

[Sampling #43006970649](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43006970649) on commit `d53668b`, [sanitized artifact](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43006970649/artifacts/13848672449):

| Observation | Rounds | Results | Cloudflare POP |
|---|---:|---|---|
| Eight API GET/OPTIONS route probes per round | 3 | **24 / 24 HTTP 502** | `IAD` |
| Frontend Microsoft bridge (GET) | 3 | **3 / 3 HTTP 200** | Not reported as Cloudflare |
| Entire run | 27 probes | **24 / 27 anomalous → workflow failure** | One observed API POP |

Earlier public deploy runs include [#43003860875](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43003860875) with eventual green hosted gate, and red/green observations from `DFW`, `IAD`, `SJC`, `SEA`, and `MXP` in #147. This run provides strong evidence of a failing **IAD runner vantage during those timestamps**, **not** a proven permanent outage or causality within Cloudflare. One hosted runner is **not multi-region**.

### Follow-up comparison: release gate #43007879412 (same SHA `d53668b`)

The [Raspberry release run](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43007879412) passed ARM64/deploy/backup. Its first hosted strict gate failed; same-round independent route probes from **`MSP`** were **health 200, version 502, providers 200, social OPTIONS 502, private history GET 401 and OPTIONS 204, Pages redirect 200**. The Pi connector network reached origin **HTTP 200** and public API **HTTP 200 from `MXP`**, with healthy containers and no OOM/restart. **A single rerun of only the failed public gate, same SHA without deploying, passed** (workflow attempt 2 green). This further distinguishes an intermittent request-path failure from a consistently dead origin or POP; the evidence does **not** establish a precise Cloudflare root cause.

## Follow-up for the Cloudflare domain/tunnel owner (out of repo)

1. Check the exact public hostname `api.vuxoapi.xyz`, its Cloudflare DNS/tunnel mapping and Zero Trust **Public Hostname** ingress for the expected internal `http://api:8080` service. Verify the route has not drifted; do not paste tunnel tokens or client secrets into issues.
2. Inspect tunnel connector health / connection events, route availability, account-level firewall/edge analytics and any relevant Cloudflare incidents around the linked run timestamps. Compare IAD failing samples with successful Pi-side MXP/origin probes already recorded in #147. This is a *request-path comparison*, not proof that a whole POP is down.
3. If Cloudflare telemetry requires a full request ID, retrieve it from the Cloudflare owner's private logs; **never publish raw CF-Ray IDs** or personal data in GitHub issue comments.
4. Rerun the read-only workflow in distinct time windows and, where allowed, from genuinely independent regions. A few all-green rounds may indicate transient recovery, not root cause closure.
5. After making an owner-reviewed external routing/config fix, separately require the **unchanged** GitHub-hosted `verify-public-auth` deployment gate (strict commit/HTTP 200/401/CORS), real provider-consumer login checks #136/#139 and repeated no-502 availability before closing #147.

**Do not** weaken the release gate, alter OAuth tenant/origins, expose secret configuration, restart PostgreSQL or treat React/browser retries (#185) as a root-cause fix.
