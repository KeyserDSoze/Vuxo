# VUXO 0.0.1 — Verified Refuge Adventure Overview (#120)

## User-facing goal

The Refuge Journal shows a responsive **Your adventure at a glance / La tua avventura in breve** panel above the existing inventory, available portals and verified audit timeline. It helps players understand which off-world actions are *actually recorded* without implying that the client has a full activity ledger. It works with both dark/light theme and IT/EN i18n. Guests see no private overview.

## Exact sources and claims

| UI metric | Source already read by the Journal | Meaning and limitation |
| --- | --- | --- |
| Award records | `GET /api/inventory` (owner-fenced), number of returned grant entries | **Not** item quantity or a claim that a portal was completed |
| Portals available now | `GET /api/personal-content`, filtered to sequence portal grants | These are available challenges, **not** victories |
| Completed runes | Owner `history/completed` or `history/outcomes` verified rows | Only loaded completion receipts; does not infer from inventory |
| First mistakes | Owner `history/outcomes` entries with `kind=sequence_first_mistake` | First damaging mistakes only, **not** all wrong attempts |
| Guardian victories / retreats | Owner `history/outcomes`, audited terminal events | Two separate outcomes; **not** rewards or XP |
| Linked rewards | `rewardItemKey` attached to audited sequence completions | Reward provenance verified by server; never inferred from Guardian wins |

The history component publishes a summary only **after** its existing authenticated owner guard, runtime contract, and descending 100ns/UUID pagination validation succeed. It does not send new HTTP requests. Counting is over the **full accepted history pages**, not over locally filtered/search-visible entries. A successful empty server response may show `0` for that metric. Unavailable, pending or failed reads, or a history mode not covering a category, show **Not verified / Da verificare**, not zero. Switching from Completed to All outcomes is required to observe Guardian/mistake counts. `hasMore` and the number of loaded rows are displayed; the result is **not** a transaction-consistent lifetime total.

## Privacy, refresh and failure behavior

`RefugeJournalPage` is keyed by the account access token. On an owner switch it remounts all private state, so account A's recorded counts cannot carry into account B. Refresh All invalidates the summary before re-reading. Switching history mode or refreshing the audit section invalidates the old historical counts; a failed or malformed history page clears them rather than leaving stale success values. Independent inventory and portal failures make **only the affected metrics** unavailable; the others may remain valid. All requests remain read-only, abortable and owner-scoped.

## Code and focused tests

- `src/frontend/src/features/refuge/refugeAdventureOverview.ts`: pure summary model (no React, no browser APIs, no storage).
- `src/frontend/src/features/refuge/RefugeAdventureOverview.tsx`: read-only responsive seven-metric MUI panel.
- `src/frontend/src/pages/RefugeJournalPage.tsx` and `src/frontend/src/features/refuge/RefugePortalCompletionHistory.tsx`: connect existing private read results to the new panel, preserve parent/child owner safety.
- `src/frontend/src/i18n.ts`: labels, unknown state, loaded-only scope and disclaimers in both IT and EN.
- `src/frontend/scripts/refuge-adventure-overview.contract.test.mjs`: **12/12 PASS** on Node 22.16.0; covers unknown vs actual zero, complete vs outcome modes, reward provenance, page growth, owner independence, nonmutation and no invented XP.
- `src/frontend/tests/refuge-linked-rewards.spec.ts`: **four authored, NOT RUN** Playwright browser cases for modes/metrics, failed reads and retry, late owner switch, and increasing history pages. Guest privacy assertion added to `refuge-journal.spec.ts`.
- Root `node scripts/verify-offworld-local.mjs --contracts` now includes this sixth focused Node test script. Its actual six-script run must still be verified on a complete checkout.

**Actually executed:** 12/12 new model tests and isolated strict TypeScript check; new TSX transpile and focused TypeScript check using local shims, not installed production React/MUI packages. The three newly authored source Git blobs match local SHA values: `8ef9beb5c386153b04a3ca9f6d3bf3c468bc0878` (pure model), `8fda58a9767ba680a2e032408b0c8cc76f34e1cc` (Node tests), `c9eabcebeb7f77c99a5e21dc4a7531f766c32647` (TSX).

**Not executed:** full React build, actual Chromium Playwright, .NET/xUnit and real PostgreSQL integration/SQL plans. These require a complete checkout, npm/Chromium, .NET 10 and a **NONPRODUCTION** PostgreSQL cluster; follow `docs/engineering/offworld-local-qa.md` and require explicit `VUXO_TEST_POSTGRES_ACK=disposable`. Do not run Actions, merge or deploy while #112 is unresolved and issue #120 remains open.


## Navigating the summary cards (QA C0aa)

Each of the seven summary metrics now acts as a keyboard-accessible in-page button. **Award records** and **Available portals** scroll/focus the matching existing section without making another API request. **Rune completions** and **linked rewards** open the verified completion-history mode (linked rewards apply the existing causal-reward filter). **First mistakes**, **Guardian victories** and **Guardian retreats** open the all-outcomes history mode with their corresponding exact event-family filter. Victories and retreats are no longer grouped when a specific summary card was selected; the optional `Guardians` filter still shows both. Focus transfers to the history heading, and no additional route, external URL or write operation is introduced.

A navigation request is account-local, monotonic and consumed once by the mounted history child. A mode switch clears old accepted history/cursor and reads page one with its existing authenticated owner fence. Selecting a new local filter in the already-loaded mode does not re-fetch history or rewrite any audit receipt. Refresh All clears a pending jump, and account switching remounts all private state. The summary remains a **loaded-only, not lifetime** data view, including on a filtered result that shows no matches.

**Actually executed:** 20/20 focused Node contracts for metric destinations and exact Guardian filters, isolated strict TypeScript on pure modules with a type-only `HistoryEntry` fixture; source SHA values in `docs/engineering/offworld-integration-validation.md`. **Authored but NOT RUN:** two new Playwright keyboard/mobile/Guardian navigation cases. Full React build, seven-suite local gate, Chromium and PostgreSQL/.NET are still missing in this environment. Keep #120 open; no merge/deploy.


## Race-safe navigation and refresh (QA C0ac)

In addition to aborting HTTP requests in React effect cleanup and checking the current JWT owner, the Journal now uses an immediately invalidated **request generation ticket**. A mode-changing summary click, manual history mode switch or refresh revokes the old ticket *synchronously*, before any old HTTP response can update the visible timeline, its cursor, error/loading state or the read-only progress summary. The new page's request receives a fresh ticket. Merely changing a local filter within an already-loaded history does not refetch. These tickets are stored only in the current mounted account's component, contain no token or private data, and do not replace server-side authorization.

**Executed locally:** 9/9 pure Node contract tests for pending/late response invalidation, strict isolated TypeScript PASS, exact Git hashes in `docs/engineering/offworld-integration-validation.md`. **Authored not run:** browser regression with a held completion response released after the player jumps to Guardian results. The complete 9-suite quick gate, frontend build, Chromium, .NET and PostgreSQL have not run here; maintain the release hold.


## Local-calendar timeline grouping (QA C0ad)

The verified personal-history list is grouped by **local calendar day**, with heading language following the player’s current IT/EN setting. A keyboard-accessible MUI switch can show the original continuous list instead. Completion rows are grouped by their server-verified `completedAtUtc`; outcome rows use their verified `occurredAtUtc`. A day heading shows a count of **visible, loaded** events only; neither the grouping nor its localized label is server evidence or an all-time record count. Device-local calendar days can differ from UTC at midnight or around daylight-saving changes. Individual receipt order, reward provenance, owner isolation, filtering, search, pagination and server cursor verification remain unchanged.

**Executed locally:** 12/12 deterministic Node contracts and isolated strict TypeScript with a type-only source fixture, exact Git SHA values in `docs/engineering/offworld-integration-validation.md`. **Authored but NOT RUN:** two Chromium E2E tests for day grouping/search/pagination/no new GETs and mobile Guardian outcomes. Full ten-suite QA runner and complete browser/.NET/PostgreSQL release gates remain pending.
