# VUXO 0.0.1 — Off-world integration validation (#120)

> **Status: pending execution.** This checklist is a release gate, not a record of successful build or tests. GitHub Actions minutes are exhausted (#112). The integration branch is **not** merged into `main` and must not be deployed until every relevant gate below passes.

## Exact integration snapshot

- Technical branch: `integration/120-offworld-0.0.1`
- Initial integration commit: `d4a72d8a903fe7bd786e3cc9537ffd8d8a39f5f8`
- Baseline: `feature/119-linked-rewards` (`9f07fbda1aa5d0681a27949fd86dbafb6e4daaef`).
- Source overlays: `feature/113-home-rune-teaser` (`dbddc231`), `feature/116-inventory-loadout` (`9a2ef000`, includes #115), `feature/117-refuge-adventure-guide` (`95632a52`, includes #114).
- Special conflict resolution: `src/frontend/src/i18n.ts` merges the IT/EN vocabulary of every branch; `src/frontend/src/pages/RefugePage.tsx` combines Journal access with session-bound HP and Preparation/guide refresh.
- Original issues: #113 through #119; integration issue #120; delivery blocker #112.

The original branches remain available for diffing and regression diagnosis. The merged snapshot does **not** imply the separate features have passed CI.

## Verified statically during assembly

- 16 non-conflicting files preserve their Git blob SHAs from the original Home, Inventory and Refuge branches.
- 383 other pre-existing files preserve their Git blob SHA from the audit-backed Journal/Portal backend branch.
- The integrated code retains the lazy Journal route, rune teaser, inventory loadout, owner-scoped Refuge preparation and adventure guide, and the owner-only historical APIs.
- New `src/frontend/tests/offworld-integrated-navigation.spec.ts` contains 3 cross-surface scenarios for guest, owner and English mobile keyboard flows.
- **These are structural inspections, not a TypeScript build, .NET compilation, PostgreSQL test, browser test or deployment.**

## Gate A: local build (no GitHub Actions)

On a workstation with .NET 10 SDK, Node.js, npm and a local PostgreSQL instance:

```bash
git switch integration/120-offworld-0.0.1
dotnet restore Vuxo.sln
dotnet build Vuxo.sln -c Release --no-restore

cd src/frontend
npm ci
npm run build
```

Record the command outputs and exact commit SHA in #120. Any compiler error is a blocker; do **not** merge by suppressing TypeScript errors or omitting the affected files.

## Gate B: backend and real database behavior

```bash
# Set VUXO_TEST_POSTGRES_CONNECTION_STRING securely in your shell or secret store.
# Use a disposable local PostgreSQL instance: integration tests create/drop databases.
dotnet test Vuxo.sln -c Release --no-build
```

`VUXO_TEST_POSTGRES_CONNECTION_STRING` is read by `PostgresIntegrationFactAttribute`. **A green test run that skipped those tests is NOT sufficient.** Confirm the PostgreSQL integration tests actually executed, especially:

- `PortalCompletionHistoryPersistenceTests`, `PortalOutcomeHistoryPersistenceTests` and `PortalRewardProvenancePersistenceTests`.
- Owner isolation across different player IDs, audit/causation agreement, no false Guardian award, forged causation excluded.
- Migrations `202611060001`, `202611060002` and `202611060003` applied in order against a disposable database.
- Failed/expired/grant-only records are never labeled completed without a supported audit event.

## CORS/preflight regression gate (QA fix #120)

The Playwright fixtures in `inventory-loadout.spec.ts`, `inventory-browse.spec.ts`, `refuge-preparation.spec.ts` and `refuge-journey.spec.ts` now provide `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` for `Authorization, Content-Type, Idempotency-Key`, and explicit methods. **OPTIONS is a browser preflight, not an equipment mutation or a heal/rest request.** When a mocked DELETE/POST is expected, OPTIONS returns 204 without changing fake stock, rest keys or mutation counters.

When running Gate C, pay particular attention to the existing tests asserting **exactly one actual** `DELETE /api/equipment/charm`, `POST /api/characters/me/heal/...` and `POST /api/characters/me/rest`. They must not pass by counting OPTIONS, and must not fail because an OPTIONS was rejected with HTTP 405. A successful preflight is not proof that the subsequent authenticated request was accepted by the backend; the mocked user-visible result is still a separate contract.

## Gate C: browser and i18n regression

```bash
cd src/frontend
npx playwright install chromium
npm run test:e2e
```

Playwright uses `playwright.config.ts` to build and serve the preview itself. At minimum examine these existing suites alongside the full run:

```bash
npx playwright test \
  tests/home-rune-teaser.spec.ts \
  tests/inventory-browse.spec.ts \
  tests/inventory-loadout.spec.ts \
  tests/refuge-preparation.spec.ts \
  tests/refuge-journey.spec.ts \
  tests/refuge-journal.spec.ts \
  tests/refuge-completion-history.spec.ts \
  tests/refuge-outcome-history.spec.ts \
  tests/refuge-linked-rewards.spec.ts \
  tests/offworld-integrated-navigation.spec.ts
```

Acceptance: the home teaser and Journal do not import Phaser chunks; guests never initiate private owner reads; changing account immediately clears private data; admin-only routes remain guarded; HP 0 does not suggest unauthorized healing; canonical slot changes and consumables stay server-controlled; each API 503 has an explicit error/retry path; all new UI copy is present in Italian and English; responsive views at 320 px avoid horizontal scrolling; buttons work by keyboard.

## Gate D: review, CI and deployment (only when quota #112 is restored)

1. Resolve **every** failing compiler/test/migration check on the isolated integration branch.
2. Reconcile the issue/ledger and validate the bilingual patch note for `0.0.1`.
3. Only then open a review PR / run the existing CI and E2E workflows. Do not disable tests to achieve green status.
4. Following a passing review, merge according to the repository's release process; verify the GitHub Pages `vuxo.app` deployment and API separately.
5. Close #120 and the underlying feature issues **only after** their individual acceptance criteria and actual test results are recorded. #112 remains open until the deployment problem is resolved.

## Known limits unrelated to merge conflicts

The historic results are constrained by actual persisted server evidence. Do not invent failed attempts, expiry states, Guardian rewards or old item provenance. The current offset pagination is deterministic on a stable database snapshot, but concurrent new outcomes can shift later pages; plan a cursor/snapshot follow-up if this becomes material.

**Do not put any secret, access token or PostgreSQL connection string in a GitHub issue, commit or chat.**
