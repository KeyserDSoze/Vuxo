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
- Owner isolation across different player IDs, audit/causation agreement, no false Guardian award. `PortalRewardProvenancePersistenceTests` must persist AND reject all three forgeries: wrong cause, correct cause but wrong grant correlation, and correct cause/correlation but wrong item key. The legitimate canonical reward must still appear on both history endpoints.
- Migrations `202611060001`, `202611060002` and `202611060003` applied in order against a disposable database.
- Failed/expired/grant-only records are never labeled completed without a supported audit event.
- Verify negative audit-corruption checks in `PortalCompletionHistoryPersistenceTests` and `PortalOutcomeHistoryPersistenceTests`: mismatched completion correlation/rules, first-mistake correlation/rules, missing or mismatched Guardian encounter-start causation/correlation and terminal-turn correlation must all exclude the corresponding event. Confirm the other owner's genuine events are still visible.

## CORS/preflight regression gate (QA fix #120)

The Playwright fixtures in `inventory-loadout.spec.ts`, `inventory-browse.spec.ts`, `refuge-preparation.spec.ts` and `refuge-journey.spec.ts` now provide `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` for `Authorization, Content-Type, Idempotency-Key`, and explicit methods. **OPTIONS is a browser preflight, not an equipment mutation or a heal/rest request.** When a mocked DELETE/POST is expected, OPTIONS returns 204 without changing fake stock, rest keys or mutation counters.

When running Gate C, pay particular attention to the existing tests asserting **exactly one actual** `DELETE /api/equipment/charm`, `POST /api/characters/me/heal/...` and `POST /api/characters/me/rest`. They must not pass by counting OPTIONS, and must not fail because an OPTIONS was rejected with HTTP 405. A successful preflight is not proof that the subsequent authenticated request was accepted by the backend; the mocked user-visible result is still a separate contract.

## Gate C0: owner history JSON contract tests (no browser or GitHub Actions)

With Node.js 22+ installed, run the standalone validation suite **before** the full Playwright build:

```bash
cd src/frontend
npm run test:contracts
```

This requires no connected API, Chromium or PostgreSQL and uses the Node test runner with built-in TypeScript stripping. It checks canonical rune completions, all four outcome kinds, duplicate IDs, pagination, invalid dates/UUIDs, missing rewards and responses that wrongly attribute rune rewards to Guardian or first-mistake results. The first local execution on Node **22.16.0 passed 8/8** and the parser passed an isolated `tsc --noEmit --strict` check. Both are useful early smoke tests, **not evidence that the complete frontend compiles or that the backend query works**.

When Gate C (Playwright) becomes runnable, also execute the new malformed-response/retry scenarios in `refuge-completion-history.spec.ts` and `refuge-outcome-history.spec.ts`. Confirm the Journal shows an error, renders **zero invented entries**, and recovers on retry. Never treat `npm run test:contracts` alone as release approval.

## Gate C0b: owner inventory, health and encounter contracts

The same offline command now executes both contract suites:

```bash
cd src/frontend
npm run test:contracts
```

Required: all **20** Node contract cases pass (8 history + 12 owner-read), and the pure modules `portalHistoryContract.ts` and `ownerReadContracts.ts` pass standalone strict TypeScript checks. The first combined local run on Node 22.16.0 yielded **20/20 PASS**, with both modules checked by `tsc --noEmit --strict --target ES2022 --module esnext`.

When Chromium is available, explicitly run `tests/owner-read-contracts.spec.ts` (4 new authored scenarios) together with the existing inventory/refuge suites. A duplicate inventory grant, duplicate equipment slot, HP exceeding max and an idle encounter carrying a portal ID must display an error or unknown state, not a falsely usable owner snapshot. Retry and refresh should restore the genuine server state. **These browser tests are not executed yet.** Do not treat the pure module tests as a complete React build.

## Gate C0c: rest, item-healing and equipment mutations

`npm run test:contracts` now also discovers `src/frontend/scripts/owner-mutations.contract.test.mjs`. Run it on Node 22+ with the other pure suites. The first isolated mutation run on Node **22.16.0 passed 11/11 tests** and `ownerMutationContracts.ts` passed `tsc --noEmit --strict --target ES2022 --module esnext`. These passes do **not** establish a working browser or database.

Mutation-specific release checks:
- A successful `POST /api/characters/me/rest` must echo the **same idempotency UUID**, coherent HP change, a valid timestamp and a later cooldown time. An invalid HTTP 200 must keep the pending UUID for a safe retry; never render speculative HP.
- A successful `POST /api/characters/me/heal/{grantId}` must echo **both the UUID and grantId** with consistent HP, consumption time and boolean replay state. Malformed 200 must retain the UUID; do not consume local stock.
- Successful `POST /api/equipment/{grantId}/equip` must include that exact grant in its confirmed loadout; `DELETE /api/equipment/{slot}` must return that slot empty. A contradictory 200 requires read-only refresh and no stale inventory controls.
- Execute all four scenarios in `tests/owner-mutations.spec.ts` with Chromium, as well as the existing heal/rest/equipment suites, once a local browser setup is available. The four new Playwright tests are **not yet executed**.

## Gate C0d: one in-flight owner mutation and account switch

Offline Node/strict-TypeScript gate for the single-owner action lease:

```bash
cd src/frontend
node --experimental-strip-types --test scripts/owner-action-gate.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/inventory/ownerActionGate.ts
```

First local run on Node **22.16.0: 6/6 PASS**, standalone `tsc`: **PASS**. The module ensures only one pending action ticket per authenticated owner, rejects a foreign/anonymous session, and invalidates in-flight responses after logout, account switch and disposal. `npm run test:contracts` also discovers this suite with the others.

When local Playwright is available, run `tests/owner-action-races.spec.ts` (4 new cases, **not executed**): delay a heal POST and its three follow-up GETs, verify no re-use of previous stock; delay equip and verify no overlapping heal; switch accounts during an in-flight equip POST and verify owner B never receives A's loadout; switch accounts during pending rest and ensure owner A's late HP cannot overwrite B. Exercise CORS preflight and ensure **only actual POST/DELETE** count as mutations.

## Gate C0e: multi-device snapshot coherence

Run the dependency-free Node suite (it is also included by `npm run test:contracts`):

```bash
cd src/frontend
node --experimental-strip-types --test scripts/inventory-snapshot.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/inventory/inventorySnapshotConsistency.ts
```

First local execution on Node **22.16.0 passed 11/11** and the isolated strict TypeScript check passed. The parser rejects contradictory availability/equipment views, retries **both** owner GETs once for a torn read, then fails closed. This does not provide a transaction or cross-device live push: server enforcement remains mandatory.

Once PostgreSQL is available, run the two new `CharacterHealingPersistenceTests` cases `TwoDevicesRestAndHeal_CharacterLockPreservesBothHpMutationsAndAudit` and `TwoDevicesEquipDistinctAwardsIntoSameSlot_OnlyOneCommitAndAudit`. Confirm actual PostgreSQL execution, not skip. The required result is **one rest receipt, one heal receipt, two corresponding audit events and final 20 HP** for the first test; **one equipped charm slot, one remaining available grant and one equip audit** for the second. Replayed rest/heal keys must not duplicate mutations.

Once Chromium is available, run `tests/inventory-cross-device.spec.ts` (3 new scenarios, **not executed**): persistent torn pairs show safe errors until refresh; a single stale read is resolved by bounded reread; a valid equip POST superseded by another device must display the latest owner GET and never invent another equip.

## Gate C0f: foreground owner sync + unknown encounter status

`npm run test:contracts` discovers `scripts/owner-focus.contract.test.mjs` alongside the other pure suites. It can also be run directly:

```bash
cd src/frontend
node --experimental-strip-types --test scripts/owner-focus.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/auth/ownerFocusGate.ts
```

First local execution on Node **22.16.0: 8/8 PASS**, standalone strict TypeScript **PASS**. Check that owner refresh is initiated only for the current authenticated user, only in a visible tab, never while the page is loading or committing a write, and only once for a paired focus/visibility event. This does not replace actual multi-device E2E or database tests.

When running Gate C in Chromium, include **`tests/owner-foreground-sync.spec.ts`** (4 authored scenarios, **not executed**). Switch an owner's stock or HP/encounter state in the API fixture while the page is inactive; returning to the tab must re-read without creating POSTs. Mock a 503 encounter-status response: neither `POST /api/characters/me/rest` nor `POST /api/characters/me/heal` should be possible until the status GET is retried successfully. Test Italian/English strings and verify no misleading 'active encounter' claim on an unavailable response.

The two missing commas in the IT/EN `inventory.loadout.replaceHint` dictionaries were fixed during this slice. **Run the full `npm run build`** when dependencies are available to verify all TypeScript/translation syntax, rather than treating structural inspection as compilation.

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
  tests/owner-read-contracts.spec.ts \
  tests/owner-mutations.spec.ts \
  tests/owner-action-races.spec.ts \
  tests/inventory-cross-device.spec.ts \
  tests/owner-foreground-sync.spec.ts \
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
