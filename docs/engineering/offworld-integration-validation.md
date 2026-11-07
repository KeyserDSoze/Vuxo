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

## Gate C0g: API owner-read UUID identity normalization (#120)

The frontend's runtime parsers must reject duplicate grant IDs even when the same UUID appears with different letter casing in inventory awards, within or across stack available IDs, or across equipped slots. Canonical item keys retain their original case-sensitive comparison. The parser must reject the entire invalid response and never infer additional items or rewards.

Run with Node.js 22+ from `src/frontend`:

```bash
node --experimental-strip-types --test scripts/owner-read.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/contracts/ownerReadContracts.ts
```

**Evidence:** Node 22.16.0 **16/16 PASS** (12 existing + 4 new regression tests) and isolated strict TypeScript **PASS**. Both committed Git blob SHAs match the exact locally executed files. The comprehensive React build, Chromium/Playwright, backend/.NET and real PostgreSQL integration suites have **NOT** been run for this revision. Keep issue #120 open and do not open a PR, merge or deploy while #112 remains blocked.

## Gate C0h: Journal history identity and chronological receipts (#120)

The pure history parser now rejects duplicate completion grant IDs and duplicate outcome event IDs under case-insensitive UUID identity, plus completed-at timestamps that precede granted-at timestamps after normalizing timezone offsets. This is an advisory UI contract only: backend audit/provenance still governs actual grants, rewards and player state. Distinct events for one grant remain allowed; an old completion without a reward must not gain a speculative reward.

Run on Node.js 22+ from `src/frontend`:

```bash
node --experimental-strip-types --test scripts/portal-history.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/portals/portalHistoryContract.ts
```

**Executed locally:** Node.js 22.16.0: **12/12 PASS** (8 existing + 4 new); `tsc` 5.8.3 standalone strict check **PASS**. Against the previous parser, the expanded test suite was **9 PASS / 3 FAIL**; all 12 pass after the fix. The committed blob SHAs exactly match the executed source (`1f0a69c89e5c3d671a6649ae6e3069ff4d70bf4c`) and tests (`b63ae8a87c6303e5ee326de618906ea84f18f8be`).

**Pending release gate:** full frontend build, Chromium Playwright Journal flows, backend xUnit + real PostgreSQL provenance joins, and QA of the complete integration branch. These were **not executed** in this slice. Issue #120 stays In progress, #112 blocks CI and no PR/merge/deploy is allowed.

## Gate C0i: mutation test import and equipment UUID confirmation (#120)

The offline mutation contract test previously imported `../src/ownerMutationContracts.ts`, which is missing on the integrated branch; the canonical path is `../src/features/contracts/ownerMutationContracts.ts`. The original suite raised `ERR_MODULE_NOT_FOUND` before any test ran. This has been corrected and should remain a required contract gate. A confirmation of equip must not accept an invalid requested UUID, even if a malformed response echoes it; uppercase/lowercase variants of valid UUIDs remain equivalent.

From `src/frontend` run:

```bash
node --experimental-strip-types --test scripts/owner-mutations.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/contracts/ownerMutationContracts.ts
npm run test:contracts
```

**Actually run in isolated local environment:** the repaired specific suite on Node 22.16.0: **13/13 PASS** (11 original + 2 added), and TypeScript 5.8.3 standalone strict compile: **PASS**. Original file with its broken import was executed first and yielded `ERR_MODULE_NOT_FOUND` with 0 tests. GitHub source/test blobs (`924e6a8276ca15b3921ac7b46fd7e3a8f29fc212`, `ad7299e6079697256084766a76eccd0f910f21c6`) match the files actually executed after correction. The **aggregate** `npm run test:contracts` command, full React build, browser Playwright and real backend/PostgreSQL checks are **not yet executed** and remain release gates. No PR/merge/deploy while #112 is blocked.

## Gate C0j: strict calendar timestamps in portal history (#120)

Node's built-in `Date.parse` can normalize malformed ISO calendar values (e.g. `2026-02-31T10:00:00Z` into a date in March). The Journal parser now validates day/month/leap-year, clock ranges, explicit Z/offset (`±14:00` maximum), and up to seven fractional digits used by .NET `DateTimeOffset`. Confirm valid leap days and offset-equivalent timestamps still parse, while malformed receipts fail closed. This remains an **advisory client contract**, not proof of reward provenance or backend audit integrity.

From `src/frontend`:

```bash
node --experimental-strip-types --test scripts/portal-history.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext src/features/portals/portalHistoryContract.ts
# Required later, with the complete repository checkout:
npm run test:contracts
npm run build
npm run test:e2e
```

**Executed locally:** exact Git blobs for history source `2c0922c0ad02228da94b8adee4e88692a3cd4f76` and tests `e194514b08b921f45a06f7d50d2390c841e9be01` passed **16/16** Node 22.16.0; the historical owner-mutation suite also passed **13/13** in the same Node invocation (**29/29 total**), with strict TypeScript 5.8.3 for both modules passing. Only **two** of the repository's contract suites were available together in the isolated local verification directory. The actual aggregate `npm run test:contracts` on all repository scripts, full React build, Chromium Playwright and backend/PostgreSQL checks **have not run**; do not claim release readiness. No GitHub Actions/PR/merge/deploy while #112 remains blocked.


## Gate C0k: shared strict timestamps and enforced CI contract test gate (#120)

Timestamp-bearing owner responses (inventory awards, equipped items, active portal encounter), rest/heal receipts, and Journal history now share `src/frontend/src/features/contracts/serverTimestamp.ts`. Reject impossible calendar dates, clock overflow, missing timezones, offsets beyond ±14:00, and more than seven fractional digits while preserving valid .NET `DateTimeOffset` values. The client never computes or grants server-owned rewards.

The frontend CI job now executes `npm run test:contracts` after dependency installation and before the React build. This is a **future quality gate**, not proof of CI execution while #112 is blocked.

```bash
cd src/frontend
npm ci
npm run test:contracts
npx tsc --noEmit --strict --target ES2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions src/features/contracts/serverTimestamp.ts src/features/contracts/ownerReadContracts.ts src/features/contracts/ownerMutationContracts.ts src/features/portals/portalHistoryContract.ts
npm run build
npm run test:e2e
```

**Executed locally on Node 22.16.0:** identical shared timestamp helper and two isolated regression tests **2/2 PASS**; standalone strict TypeScript for the helper **PASS**. Four new cross-parser test cases (two owner reads, two mutations) are **authored but not executed** in the complete repository context. Previously completed Journal 16/16 and mutation 13/13 runs apply to the prior snapshot, not this commit. Full aggregate, React build, Playwright, .NET and PostgreSQL remain **pending**. Keep #120 open; never merge/deploy merely because the helper passed.


## Gate C0l: 100ns receipt chronology on the integration branch (#120)

**Behavior:** previously `Date.parse` silently collapsed timestamps that differed by less than 1 millisecond. A portal completion at `10:00:00.1234566Z` could look simultaneous with its grant at `10:00:00.1234567Z` and bypass the client's chronology guard. The shared helper now compares instants at all seven .NET fractional digits, normalizing offsets, while refusing year `0000`. The comparison strips fractional seconds before `Date.parse` and compares the full 100ns fraction independently, avoiding browser-specific rounding. `portalHistoryContract.ts` uses this check for grant/completion ordering; `ownerMutationContracts.ts` uses it for rest versus next allowed time. These guards are advisory: the server remains the only source of gameplay truth.

```bash
cd src/frontend
node --experimental-strip-types --test scripts/server-timestamp.contract.test.mjs
npx tsc --noEmit --strict --target ES2022 --module esnext src/features/contracts/serverTimestamp.ts
# Still required from a complete checkout with npm dependencies:
npm run test:contracts
npm run build
npm run test:e2e
```

**Actually executed locally (Node 22.16.0):** **6/6 PASS** for the exact helper and six regression tests; standalone TypeScript strict compile **PASS**. The locally tested helper has Git blob `c1d1c42c09fc54685eed7f50fa1107a43d469ac6` and the tests `1ed26d29db1901d5f4f9f9390a4a10de6207690f`, both matching the committed files. The tests include 100ns negative/positive ordering, offset equality, second rollover, fraction width and invalid year zero.

**Authored but not executed:** one extra portal history regression and one rest-receipt regression in the existing Node suites. **Not executed:** full `npm run test:contracts`, React build, Chromium Playwright, backend .NET or PostgreSQL integration. Keep #120 open; #112 continues to block Actions, PR/merge and deployment.


## Gate C0m: isolate read-only owner data across login/logout and stale GETs (#120)

**Reproduction/root cause:** a read-only off-world view can begin a GET with the live JWT, then the user signs in as another account while the response is pending. An AbortController and React keyed remount are necessary but do not by themselves guarantee a stale fetch/proxy callback cannot publish data. Inventory also retries a non-atomic stacks/equipment read pair; an obsolete owner view must not launch the second retry using the **new** account's ambient token.

**Implementation:** `features/auth/ownerReadFence.ts` exports `readForCurrentOwner(expectedToken, read, signal)`. It validates the active stored session and AbortSignal **before invoking** the read callback and **after it settles successfully**. It never retries the operation itself. Applied to inventory awards, all loadout/stack GET pairs (including every consistency retry), post-heal and post-equip resync, Refuge owner HP, preparation equipment+encounter, encounter eligibility hook, Journal awards/active portal grants and completed/outcome pagination. The Journal history child now receives the explicit expected session token from its keyed parent. No changes to write intentions, reward rules or server authority.

```bash
cd src/frontend
node --experimental-strip-types --test scripts/owner-read-fence.contract.test.mjs
tsc --noEmit --strict --lib ES2022,DOM --target ES2022 --module esnext --allowImportingTsExtensions src/features/auth/ownerReadFence.ts src/features/inventory/inventorySnapshotConsistency.ts
# Required release gates from a complete checkout with dependencies:
npm run test:contracts
npm run build
npx playwright test tests/offworld-integrated-navigation.spec.ts
npm run test:e2e
# Backend and real PostgreSQL as described in the primary QA checklist.
```

**Executed locally:** Node 22.16.0 **7/7 PASS**, isolated strict TS compile **PASS** for two dependency-free modules, using exact text as committed: `authSession.ts` blob `09be2041654bf1e3b6cc5d146d5673af91ad6423`, `ownerReadFence.ts` `9bff468f0883d36d6cdd7a45cc081db00a57f436`, `inventorySnapshotConsistency.ts` `3dabb557751fa54778cd4c65eebcddb939993a78`, and new test `owner-read-fence.contract.test.mjs` `10cdecca28a375041f524bdc92279720af106493`. Matrix: matching token, guest/stale preflight refusal, late successful GET after account switch, logout/expiry, AbortSignal before start/after response, active-owner transport failure and prevented cross-owner retry after torn snapshot.

**Authored but not executed:** three additional Playwright flows in `offworld-integrated-navigation.spec.ts`: delayed owner-A inventory under Journal, delayed owner-A inventory under Inventory, and delayed owner-A HP under Refuge after owner B logs in. These are added to the three pre-existing integration scenarios (six total). **Not run:** full contract aggregate, React production build, Playwright browser, backend .NET/xUnit, PostgreSQL and production deploy. GitHub Actions quota #112 remains blocked. Keep issue #120 open; no PR, merge or deployment.


## Gate C0n: account-owned portal/Guardian intentions and Phaser remount (#120)

**Root cause:** the rune challenge screen previously read its session only during rendering, while `submitPortalChallenge()` independently obtained the currently stored JWT at POST time. Account A could prepare the sequence, switch to B, and submit the old intention under B's bearer token; its in-flight challenge GET and completion receipt were not fenced. The Guardian duel had the same ambient-JWT issue for a pending card/turn, and a still-mounted Phaser world could retain private portal/dialog state across account changes.

**Code changes (no server or gameplay rules changed):** `PortalChallengesPage` now uses `useStoredSession()` and a keyed owner child to reset grants, secret previews, answers, completion/error/reward state. It reuses the proven `createOwnerActionGate()` to reserve a synchronous lease before starting a challenge or sending an answer. Stale/aborted responses never publish; the active owner is checked on both sides of GET and on receipt, all pending fetches are aborted on unmount and the success response must match the requested grant. `portalApi.ts` propagates `AbortSignal` for challenge GET and POST. `GuardianDuel` similarly isolates owner/turn/replay key, requires a live lease before card POST, fences both status and history reads and only accepts matching grant and idempotency receipts. The canonical status refresh clears a resolved old turn's replay key. `GamePage` remounts the Phaser tree by token so a new owner never inherits the previous private portal dialog or stale markers.

```bash
cd src/frontend
node --experimental-strip-types --test scripts/portal-owner-lane.contract.test.mjs
tsc --noEmit --strict --lib ES2022,DOM --target ES2022 --module esnext --allowImportingTsExtensions \\
  src/features/auth/ownerReadFence.ts src/features/inventory/ownerActionGate.ts
# Still required from a full local checkout with React, browser and backend dependencies:
npm run test:contracts
npm run build
npx playwright test tests/portal-owner-session.spec.ts tests/world-portals.spec.ts tests/portals.spec.ts
npm run test:e2e
# See earlier gates for dotnet build/test and real PostgreSQL.
```

**Actually executed locally:** Node v22.16.0 **4/4 PASS** for `portal-owner-lane.contract.test.mjs`, isolated `tsc --noEmit --strict` **PASS** for the two imported dependency-free TypeScript modules. Local Git hashes **exactly match** the branch: `authSession.ts` `09be2041654bf1e3b6cc5d146d5673af91ad6423`, `ownerReadFence.ts` `9bff468f0883d36d6cdd7a45cc081db00a57f436`, `ownerActionGate.ts` `b5d45d99b0931ad2acbd2cbd6f01ec16af0eb43c`, test `portal-owner-lane.contract.test.mjs` `4d1aa8a4ff999e10915b6e09cd2a039f37509383`. Covered delayed preview GET after switching owner, synchronous submit lease, stale success receipt, logout and expired sessions.

**Authored but not executed:** four `portal-owner-session.spec.ts` cases (delayed grants, delayed secret preview, late successful POST after A→B, rapid duplicate POST), plus one `world-portals.spec.ts` logout case for Phaser dialog/markers. Existing `portals.spec.ts` and Guardian/world E2E flows remain intact. **Not run:** any Playwright browser scenario, full TypeScript React build, full `npm run test:contracts`, .NET/xUnit or PostgreSQL. Do not claim integration verified. GitHub Actions quota blocker #112 remains; #120 stays open. No PR, merge or deployment.


## Gate C0o: validate Guardian read/turn/history responses under cross-device concurrency (#120)

**Finding:** the PostgreSQL Guardian repository already holds the character `FOR UPDATE` lock, checks `expectedTurn`, and persists idempotent turn receipts and private event history; backend concurrency remains authoritative. The frontend `guardianApi.ts`, however, previously returned `response.json() as Promise<T>` without validating the resulting `GuardianStatus` / `GuardianTurn` or the history entries. Thus an HTTP 200 with wrong grant, wrong turn, forged victory/HP/reward fields or backdated log entries could misleadingly update an encounter's UI.

**Change:** `src/frontend/src/features/portals/guardianContracts.ts` now strictly parses and projects the three owner-scoped wire responses with explicit allowed fields, canonical GUID comparisons (case-insensitive identity), valid turn bounds (0–12 status, 1–12 result/history), action and persisted ruleset validation (v1/v2), finite integer HP and damage, terminal outcome/guardian HP consistency, idempotency echo and strict .NET DateTimeOffset history timestamps up to seven fractional digits. History requires contiguous turns and nondecreasing exact 100ns chronology, and refuses further turns after victory/retreat. `guardianApi.ts` invokes these parsers for GET/status, POST/turn and GET/history. The frontend does not infer wounds, rewards or combat rules; the server/database still decides all outcomes.

```bash
cd src/frontend
node --experimental-strip-types --test scripts/guardian-contracts.contract.test.mjs
tsc --noEmit --strict --target ES2022 --module esnext --allowImportingTsExtensions src/features/portals/guardianContracts.ts
# Required from complete checkout after fixing Actions #112:
npm run test:contracts
npm run build
npx playwright test tests/world-portals.spec.ts
npm run test:e2e
# Backend xUnit and real PostgreSQL gates as above.
```

**Actually executed locally:** Node v22.16.0 **9/9 PASS** on exact test/helper files and standalone strict TypeScript **PASS**. Local `git hash-object` checks equal GitHub blobs: `guardianContracts.ts` `ac2ec254710f864afb57f5e1abb5e1b5260a2d27`, `guardian-contracts.contract.test.mjs` `377310ca314643920d12dece6a75d904c6802d53`, shared `serverTimestamp.ts` `c1d1c42c09fc54685eed7f50fa1107a43d469ac6`. Matrix covers valid v1/v2 status and zero HP, wrong-grant status, impossible HP/turns/outcomes, accepted replay and case-equivalent UUIDs, forged/mismatched turn receipts, terminal victory, 100ns history ordering, duplicate/skipped/backdated entries, malformed dates, and no history rows after terminal outcome.

**Authored but NOT executed:** three `world-portals.spec.ts` browser scenarios: wrong-grant status must not show a playable Guardian, future-turn/fake-victory HTTP 200 must not update health/turn, and out-of-order cross-device history must display an error without showing private rows. Existing real Postgres concurrent-turn tests were inspected, not rerun. Full `npm run test:contracts`, React build, Playwright Chromium, .NET and PostgreSQL suites remain **NOT RUN**; issue #120 remains open and Actions #112 still blocks release/merge/deploy.


## Gate C0p: foreground reconciliation across devices for Journal, Guardian and available portals (#120)

**Finding/root cause.** Inventory and Refuge already called the shared `useOwnerFocusRefresh` hook, but the Journal, live Guardian duel and direct portal listing did not. If another device consumed an item, completed a personal portal or advanced a Guardian turn, the mounted page continued showing the older owner snapshot until the player manually refreshed it or navigated away. Backend state and concurrency locks remained correct.

**Implementation.** Reuse the existing owner-bound, burst-limited `createOwnerFocusGate` and `useOwnerFocusRefresh`—no timers, background polling, SignalR claims or local gameplay predictions:

- Journal: on foreground, discard rewards, active grants and the paged completed/outcome history by invoking the existing `refreshAll`; reload private server GETs only after prior owner reads settle. Preserve reward filters. An aborted stale GET remains unable to publish.
- Guardian: on foreground, immediately hide old HP/cards/last-turn/history and re-read canonical server status, followed by the canonical turn history. Do not refresh during a pending card POST or while the initial status/history is loading. On canonical turn advance, the existing code discards the superseded retry key; when a failed/ambiguous request did not advance, the same replay key remains eligible for retry.
- Portal list: on foreground, discard available-grant listing and re-query the owner API **only when no challenge preview/answer is active**, avoiding loss of the player's in-progress rune sequence or a racing POST.
- Existing Inventory/Refuge focus behavior remains untouched. The shared gate refuses guests/old account, hidden tab, busy views and focus/visibility bursts within 1.5 seconds. Cross-device correctness is *eventual on foreground*, not continuous live SignalR sync.

**Commands and evidence actually executed locally (Node 22.16.0):**

```bash
cd src/frontend
node --experimental-strip-types --test scripts/owner-focus.contract.test.mjs
# 10/10 PASS on the exact existing focus gate and its Node test
tsc --noEmit --strict --target ES2022 --module esnext src/features/auth/ownerFocusGate.ts
# PASS (isolated TypeScript source)
```

The local `git hash-object` outputs **matched GitHub exactly**: `ownerFocusGate.ts` `3ab25383b0b162080ddfd6b423a3b9a875d49a60`, `owner-focus.contract.test.mjs` `1c6d68f3f7ad4a01aeabca3752008e5a8fc3331b`. These are pre-existing tested files, unchanged by this slice; they verify the debounce/authorization core, **not** the React integration.

**New Playwright scenarios authored (NOT run):** `refuge-journal.spec.ts`—cross-device item/portal consumption triggers all 3 fresh reads only once for a single focus+visibility burst; `world-portals.spec.ts`—canonical Guardian turn/HP/history updates after return without issuing a POST, and refresh is refused while a card POST is in flight; `portal-owner-session.spec.ts`—a consumed grant vanishes from idle listing on foreground, and an active rune preview survives focus without a second grant GET. **Five browser scenarios total, NOT RUN.** Existing UI tests stay intact.

**Remaining release gates:** `npm run test:contracts`, `npm run build`, `npx playwright test tests/refuge-journal.spec.ts tests/portal-owner-session.spec.ts tests/world-portals.spec.ts`, the full browser suite and .NET/PostgreSQL integration. These were **NOT executed** due to unavailable full checkout/dependencies and GitHub Actions quota blocker #112. Do not merge, create PR or deploy; issue #120 remains open.


## Gate C0q: fail-closed paginated Portal Journal history when another device changes the ledger (#120)

**Root cause:** The backend `PortalCompletionHistoryReader` and `PortalOutcomeHistoryReader` use stable order (event timestamp descending, event GUID descending) but **offset** pagination, each page fetched in an independent PostgreSQL query. If another device completes a portal between page 1 and page 2, offset page 2 can overlap the first page or return entries in an inconsistent relative chronological position. The frontend's `RefugePortalCompletionHistory` previously appended each individually validated HTTP 200 page directly, with no *cross-page* duplicate/order check, potentially displaying the same verified receipt twice.

**Implementation:** Pure `src/frontend/src/features/refuge/portalHistoryPageMerge.ts` validates the merged completion/outcome read models *before* rendering: identity is case-insensitive `grantId` for completion history and `eventId` for outcome history; verifies strictly non-increasing event instants across page boundaries using the shared 100ns-correct `compareServerTimestamps`, allows equal times with distinct IDs, checks expected entry family and page index. `RefugePortalCompletionHistory.tsx` keeps a ref of the latest accepted records (avoids a speculative React updater), and on malformed or drifted page fails closed by hiding all previously rendered results, clearing `hasMore`, displaying the existing localized error, and retrying from **page 1**. Manual refresh and history mode changes clear the accepted ref before loading. This is a *client consistency check*, **not** a claim of transactional snapshot pagination: interleavings without a detectable duplicate or order reversal can still occur until a server cursor/snapshot API is implemented.

**Executed in local runtime:** Node v22.16.0 `node --experimental-strip-types --test scripts/portal-history-pagination.contract.test.mjs` **13/13 PASS**. Isolated strict `tsc --noEmit --strict --lib ES2022,DOM --target ES2022 --module esnext --allowImportingTsExtensions` **PASS** on the exact helper and shared timestamp code, using a local **type-only** fixture that mirrors the published completion/outcome DTOs. Verified `git hash-object` of actual local sources exactly matches GitHub: `portalHistoryPageMerge.ts` `4e8ff8627eeee1b749e60c8390f67c57a8eed9f2`, `portal-history-pagination.contract.test.mjs` `68ae1eb85307f75668938854056814dacc9321fd`, `serverTimestamp.ts` `c1d1c42c09fc54685eed7f50fa1107a43d469ac6`. Tests cover valid older page, outcome event identity, duplicate GUID across pages, 100ns reversal and offset equivalence, unsorted first page, page-one reset, incomplete pagination, wrong mode, index limits and timestamp ties.

**Authored, not executed:** `tests/refuge-linked-rewards.spec.ts` receives two Playwright regressions: duplicate completion after another device's insertion clears all visible entries and retry reloads page 1 before page 2; outcome page 2 which has a timestamp just 100ns *newer* than page 1 is rejected. **Do not claim browser PASS**: full React build, full contract suite, Playwright browser runs and .NET/PostgreSQL were NOT RUN. #112 still blocks Actions. No PR/merge/deploy; keep #120 open.

**To execute on a complete local checkout:**

```bash
cd src/frontend
npm run test:contracts
npm run build
npx playwright test tests/refuge-linked-rewards.spec.ts tests/refuge-journal.spec.ts
# Then full npm run test:e2e, .NET/xUnit and PostgreSQL gates.
```


## Gate C0r: backend keyset continuation for audit-backed portal history (#120)

**Root cause.** The private completion and outcome history readers previously used `Skip((page-1)*pageSize)` with a stable per-query sort. PostgreSQL offset pagination is **not** a stable multi-request cursor: when another device creates an audit event above the previous page boundary, the old second-page offset points to an already-delivered row. The C0q frontend check was necessary but could only detect and reject the mixed read, not serve the correct next older event.

**Backend design and compatibility.** Existing `/api/personal-content/history/completed` and `/api/personal-content/history/outcomes` remain authenticated and accept the old `page` (1..1000) / `pageSize` (1..50) parameters. New optional `cursor` (only allowed for page >= 2) is a fixed 32-character base64url token of 8 bytes of UTC DateTimeOffset ticks plus 16 bytes of an already-public row identifier. For completed history this is **grantId** (not the hidden completion audit ID), and for outcome history **eventId** (already a public response field). `PortalHistoryCursor` validates exact length, alphabet, canonical encoding, nonempty ID and valid ticks. It is a bookmark, **not an authentication token**; a forged or foreign cursor cannot override the JWT player's filter.

The readers now use PostgreSQL/Npgsql translated tuple keyset predicates over `(occurredAtUtc, publicId)` with a matching descending sort, and include nullable `nextCursor` on the page response when `hasMore` is true. No database migration, new secret, extra history permission, audit payload or gameplay mutation was added. With a valid continuation, there is no `Skip`; older clients without cursors keep the previous bounded offset path (still subject to concurrent insertion drift).

```text
GET /api/personal-content/history/completed?page=1&pageSize=20
  => { items, page:1, pageSize:20, hasMore:true, nextCursor:"<opaque>" }
GET /api/personal-content/history/completed?page=2&pageSize=20&cursor=<opaque>
  => { items, page:2, pageSize:20, hasMore:false, nextCursor:null }

GET /api/personal-content/history/outcomes?page=1&pageSize=20
  => { items, page:1, pageSize:20, hasMore:true, nextCursor:"<opaque>" }
GET /api/personal-content/history/outcomes?page=2&pageSize=20&cursor=<opaque>
  => { items, page:2, pageSize:20, hasMore:false, nextCursor:null }
```

**Frontend integration.** `portalHistoryContract.ts` validates the optional `nextCursor` and refuses bogus tokens or a continuation on a terminal page, while still accepting legacy responses that omit it. `portalHistoryApi.ts` URL-encodes the bookmark and adds it to the next request. `RefugePortalCompletionHistory.tsx` tracks the cursor alongside the accepted entries, resets it on mode change, refresh and failed snapshot, and continues to run the C0q cross-page duplicate/100ns ordering guard. Existing IT/EN UI messages are reused; no new localized string is necessary.

**Actually executed now in the local runtime (Node 22.16.0):**
```bash
# local files matched the exact current GitHub blob SHA (hashes below)
node --experimental-strip-types --test \
  scripts/portal-history-cursor.contract.test.mjs \
  scripts/portal-history-pagination.contract.test.mjs
# PASS: 19/19 (six cursor and thirteen C0q cross-page tests)

tsc --noEmit --strict --target ES2022 --module esnext --allowImportingTsExtensions \
  src/features/contracts/serverTimestamp.ts \
  src/features/portals/portalHistoryContract.ts \
  src/features/refuge/portalHistoryPageMerge.ts
# PASS: isolated strict TypeScript
```

Verified Git blob identities: `portalHistoryContract.ts` `74ad1787b6ac982799a9d94e23e0f37321d28b55`, `portalHistoryPageMerge.ts` `4e8ff8627eeee1b749e60c8390f67c57a8eed9f2`, `serverTimestamp.ts` `c1d1c42c09fc54685eed7f50fa1107a43d469ac6`, `portal-history-cursor.contract.test.mjs` `0a32135aac3e94bcca2e5df56c0f37b5c8ed1805`, `portal-history-pagination.contract.test.mjs` `68ae1eb85307f75668938854056814dacc9321fd`.

**Authored but NOT executed (no .NET SDK, full npm checkout or Playwright runtime):** `PortalHistoryCursorTests.cs` checks canonical 100ns/UTC round-trips and malformed cursors; completion/outcome API suites now cover owner scoping, malformed/page-one cursor rejection before the repository, and a new event arriving between pages; two new `[PostgresIntegrationFact]` cases exercise real audited inserts between cursor reads and the EF/Npgsql tuple-comparison SQL; three new Playwright scenarios ensure the Journal transmits nextCursor, handles both outcome families and fails closed for invalid cursor metadata.

**Limitations:** a stateless keyset protects against **newer rows inserted above the last consumed key**; it is not a PostgreSQL exported MVCC snapshot. A late-committed *backdated* event below the cursor can still enter later pages, and deletions/corrections to old audit data can still change membership. The private audit is intended to be append-only; the C0q duplicate and chronological client guard remains in place. Verify SQL translation, ordering (including equal timestamps), performance and full API/DB tests on real PostgreSQL before considering release.

**Release gates still pending:** `dotnet restore/build/test Vuxo.sln`, real PostgreSQL integration, full `npm run test:contracts`, `npm run build`, focused Playwright `tests/refuge-linked-rewards.spec.ts` and the full Playwright suite. **NOT RUN**, #112 Actions quota still blocked, #120 remains open. No PR/merge/deploy.


## Gate C0s: keyset UUID tie order + explicit no-OFFSET query path (#120)

**Audit:** Npgsql officially documents `EF.Functions.LessThan(ValueTuple.Create(...), ValueTuple.Create(...))` as a translated PostgreSQL row-value comparison, but this alone does not prove that the actual union/join SQL is efficient or correct until .NET/PostgreSQL tests run. Previous Journal merge checked 100ns timestamps and duplicate IDs but did **not** check public ID descending order for **equal timestamps**, even though the new backend cursor uses that tie-break. Existing Playwright fixtures used such invalid ascending-ID, equal-time lists.

**Code fixed:** `portalHistoryPageMerge.ts` now fails closed for a newer UUID following an older UUID at the same exact timestamp. It uses the **public grantId** for completions and **public eventId** for outcomes, case-insensitively, exactly matching `PortalCompletionHistoryReader` and `PortalOutcomeHistoryReader`. The comparator still handles offsets and seven fractional timestamp digits. Both backend readers now apply `Skip` **only** on the legacy numbered-page branch; a cursor continuation never includes the `Skip(0)` LINQ operator. The outcome and linked-reward E2E fixtures were corrected to descending server order, and one regression deliberately feeds a reversed equal-time page expecting zero verified results.

**Actually executed and verified with Git sources:** Node 22.16.0 `node --experimental-strip-types --test scripts/portal-history-pagination.contract.test.mjs scripts/portal-history-cursor.contract.test.mjs`: **22/22 PASS**. Isolated strict TypeScript compile **PASS** with `tsc --noEmit --strict --target ES2022 --module esnext --allowImportingTsExtensions` on `serverTimestamp.ts`, `portalHistoryContract.ts`, `portalHistoryPageMerge.ts`. Exact local Git blobs match committed `portalHistoryPageMerge.ts` **`41dd0f6d06cbd5d2a2f70928067df68b9da69e93`** and `portal-history-pagination.contract.test.mjs` **`1a50256e09becacefb87ecbb09c5e0328a8a23d7`**; the other three unchanged helpers/tests were already verified on the preceding commit. Four new tests or replacements cover descending UUID ties, inverted cross-page ties for both families and equivalent 100ns timezone offsets.

**Authored, NOT run:** two new real PostgreSQL tests in `PortalCompletionHistoryPersistenceTests` and `PortalOutcomeHistoryPersistenceTests` validate equal-time `grant.Id` and `EventId` ordering, using the PostgreSQL `ORDER BY UUID DESC` result as the oracle (not .NET `Guid.CompareTo`); one new Playwright wrong-order response regression; fixture updates for existing Journal tests. Full .NET/EF SQL translation, migration, PostgreSQL, React build, Playwright/Chromium and end-to-end tests **NOT RUN** in this environment. No performance metrics or synthetic speedups are claimed.

**Performance gate:** see `docs/engineering/portal-history-keyset-performance.md` for exact commands, EXPLAIN/BUFFERS, UUID tie checks and index review. Existing indexes favor audit timestamp filtering, but a join-based completion UUID tie and multi-family outcome UNION may still require a sort; avoid unmeasured index additions on the Raspberry Pi. #120 open; #112 CI blocker; no PR/merge/deploy.


## Gate C0t: capture executed PostgreSQL cursor SQL and deterministic concurrent tests (#120)

**Problem / regression risk:** SQL-shape documentation and row assertions did not prove that the actual EF/Npgsql continuation SQL omits `OFFSET` and uses the row-value `<` predicate. Static inspection of `Skip` branches is insufficient to rule out EF provider translation failures. The two previously authored concurrent-insertion tests also read `UtcNow` twice while rounding a timestamp to PostgreSQL's microsecond resolution, which could produce a nonrepeatable instant at a clock boundary.

**Change:** `PortalHistorySqlCapture.cs` is a **test-only** `DbCommandInterceptor` that records the executed SQL **statement text only**, not parameter values or player identities. `PostgresDatabaseScope.CreateDbContext(params IInterceptor[] interceptors)` allows per-context diagnostic injection without changing production services. New `[PostgresIntegrationFact]` tests in both `PortalCompletionHistoryPersistenceTests.cs` and `PortalOutcomeHistoryPersistenceTests.cs` create a disposable migrated PostgreSQL test database, execute a page-2 owner history request with a real, well-formed cursor, and assert the last SELECT contains `LIMIT`, `ORDER BY`, the comparison ` < `, relevant joins and **no `OFFSET`**. They then repeat the same request without cursor and assert a legacy `OFFSET` remains. These are actual executed-command assertions, not a guessed SQL snapshot. The existing concurrent-insertion fixtures now capture UTC once before rounding to 1 microsecond. They do not introduce a production interceptor, extra logging, new migrations, or query-index changes.

**Execution status:** these new .NET/PostgreSQL SQL-capture tests are **AUTHORED, NOT RUN**. No .NET SDK, local PostgreSQL integration service or full npm workspace is available in this environment. Separately, the unchanged frontend cursor contract and page-order scripts were executed again locally with Node v22.16.0: **22/22 PASS**; the isolated `tsc --noEmit --strict --target ES2022 --module esnext --allowImportingTsExtensions` for `serverTimestamp.ts`, `portalHistoryContract.ts` and `portalHistoryPageMerge.ts` **PASS**. Local `git hash-object` matched current GitHub blobs: contract `74ad1787b6ac982799a9d94e23e0f37321d28b55`, merge `41dd0f6d06cbd5d2a2f70928067df68b9da69e93`, timestamp `c1d1c42c09fc54685eed7f50fa1107a43d469ac6`, cursor Node test `0a32135aac3e94bcca2e5df56c0f37b5c8ed1805`, pagination Node test `1a50256e09becacefb87ecbb09c5e0328a8a23d7`.

**External documentation check:** Npgsql's official mapping table documents `EF.Functions.LessThan(ValueTuple.Create(...), ValueTuple.Create(...))` translating to SQL row comparison `(a,b) < (c,d)`: https://www.npgsql.org/efcore/mapping/translations.html#row-value-comparisons . It does **not** replace a real test against the repository's Npgsql version and query composition. Check the backend test database using `VUXO_TEST_POSTGRES_CONNECTION_STRING` before treating the SQL shape as verified.

**Focused release command:**
```bash
# On a complete checkout with .NET 10 SDK, PostgreSQL available and a test-only DB URL:
dotnet test tests/backend/Vuxo.Infrastructure.Tests/Vuxo.Infrastructure.Tests.csproj \
  -c Release --filter 'FullyQualifiedName~CompletionKeyset_ExecutedSqlSeeksWithoutOffset|FullyQualifiedName~OutcomeKeyset_ExecutedUnionSqlSeeksWithoutOffset'
# Then run the entire two Portal*HistoryPersistenceTests classes, API and C# cursor suites.
```
The SQL translator, real indexes/EXPLAIN, .NET compiler, Chromium Playwright and full integration tests remain **NOT RUN**; block #120 closure and any merge/deploy while Actions quota #112 is unresolved.
