# VUXO 0.0.1 — Portal History Keyset: PostgreSQL Validation & Performance Gate

Status: **NOT RUN** for .NET, PostgreSQL, React build and Playwright. This runbook documents measurements and acceptance checks, **not** benchmark results. Applies to issue #120 after the keyset/tie-break updates on `integration/120-offworld-0.0.1`. Actions quota blocker #112 still applies.

## Semantics to verify on a real PostgreSQL instance

- Authenticated `GET /api/personal-content/history/completed`: only audited sequence completions for the authenticated owner. Ordering **`(audit.OccurredAtUtc DESC, grant.Id DESC)`**. `nextCursor` encodes the last item's timestamp and **public grant ID**, not hidden consumption audit event ID.
- Authenticated `GET /api/personal-content/history/outcomes`: only audited completions, first mistakes and terminal Guardian events for the owner. Ordering **`(audit.OccurredAtUtc DESC, audit.EventId DESC)`** across the three-family PostgreSQL `UNION ALL`. `nextCursor` encodes public event ID.
- Npgsql supports `EF.Functions.LessThan(ValueTuple.Create(...), ValueTuple.Create(...))` as a PostgreSQL row-value comparison. Confirm the generated SQL on the **installed** version `Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3`, rather than assuming the online example guarantees this particular query shape: <https://www.npgsql.org/efcore/mapping/translations.html>.
- A cursor request must contain `WHERE (timestamp, public_uuid) < (@timestamp, @uuid)` or its equivalent, with **no SQL OFFSET**. Only `page >= 2` **without cursor** may contain an offset for legacy clients. A page fetch materializes at most `pageSize + 1` history rows (maximum 51) plus a separate **bounded** proof-of-reward lookup.
- Both paths preserve owner, causation, rule-version, correlated audit, historical reward-provenance and character privacy filters. A foreign or malformed cursor never widens owner filtering; it is not a bearer token.
- Equal-timestamp receipts **must** continue by PostgreSQL UUID order, and all serialized pages must already be in that descending order before they reach the frontend.

## Reproducible release checks on a complete checkout

Use a dedicated **nonproduction** PostgreSQL database (or a sanitized test clone), not a loaded Raspberry Pi production database. The new migration was **not** changed here; these pre-existing indexes are relevant to the query planner:

- `IX_game_events_PlayerId_EventType_OccurredAtUtc_EventId`
- `IX_portal_mistake_damages_PlayerId_OccurredAtUtc_EventId`
- `IX_portal_guardian_turns_PlayerId_OccurredAtUtc_TurnEventId`

The completion reader orders ties by `grant.Id` from a JOIN rather than `event.EventId`; a sort may still be necessary even with the game-event index. The outcome reader sorts after `UNION ALL`, so a final sort is also possible. **Do not add more write-costly indexes until the measured plan justifies them**, especially for Raspberry Pi deployments.

```bash
# From the repository root, with the configured integration PostgreSQL URL:
dotnet --info
dotnet restore Vuxo.sln
dotnet build Vuxo.sln -c Release --no-restore
dotnet test tests/backend/Vuxo.Application.Tests/Vuxo.Application.Tests.csproj -c Release \
  --filter FullyQualifiedName~PortalHistoryCursorTests
dotnet test tests/backend/Vuxo.Api.Tests/Vuxo.Api.Tests.csproj -c Release \
  --filter 'FullyQualifiedName~PortalCompletionHistoryApiTests|FullyQualifiedName~PortalOutcomeHistoryApiTests'
dotnet test tests/backend/Vuxo.Infrastructure.Tests/Vuxo.Infrastructure.Tests.csproj -c Release \
  --filter 'FullyQualifiedName~PortalCompletionHistoryPersistenceTests|FullyQualifiedName~PortalOutcomeHistoryPersistenceTests'
cd src/frontend
npm run test:contracts
npm run build
npx playwright test tests/refuge-linked-rewards.spec.ts tests/refuge-completion-history.spec.ts \
  tests/refuge-outcome-history.spec.ts
# Then execute all backend, Playwright and cross-account suites.
```

**Record the actual results** (pass count, timestamp, command, test database/version, test artifacts) in the issue before closing #120. Current status: **no .NET SDK, PostgreSQL service or complete React/Playwright checkout available here**, so none of these .NET/DB/browser commands have been run.

## Query-plan and load evidence (not yet measured)

1. Generate a realistic isolated test population with multiple authenticated owners and at least small / medium / large owner-history sizes, plus several same-microsecond audit timestamps. Include all three outcome families and valid completion reward-proof rows. Do not use actual player identities or production secrets in traces.
2. Use EF Core debug command logging **only in test** (or `ToQueryString()` on the appropriate `IQueryable`) to capture the **real** SQL and its parameter values/types for first-page, next-cursor, legacy mid-page and legacy deep-page queries. Check the generated `<` tuple operator and verify **no OFFSET in cursor requests**. Capture SQL translation failures as release blockers; do not infer success from C# compilation alone.
3. In the isolated database, compare actual query plans with `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` for the above requests. Note total execution time, sort strategy and memory, rows examined/returned, shared buffer hits/reads and whether the joins and owner filters use the known indexes. Review reward-provenance query separately. **Run EXPLAIN only for the read-only captured SELECT**, after replacing any private data with synthetic owner IDs.
4. Warm up each test and repeat it across both page sizes 20 and 50, with at least three owner-history scales; report p50/p95 end-to-end API latency and DB time plus request/response bytes. Compare keyset next-page against legacy high-offset page on the same data. **Do not report a made-up benchmark or absolute speedup**; track baseline and decide whether a new partial/indexed sort key is justified by the measured plan.
5. During a real concurrent writer test, insert a *newer* event between GET page 1 and page 2. The cursor continuation must never repeat page 1 and must not skip an older receipt, including when timestamps are identical (PostgreSQL UUID ties). Verify owner B never receives owner A data even when reusing A's cursor.
6. Confirm guest/expired JWT, invalid base64url, foreign owner, first-page cursor, out-of-range page/pageSize, cancellation and read-model failure behavior. Ensure no write actions or additional permissions are introduced by history reads.

## What this protects — and what it does not

Keyset continuation gives stable traversal past **newly inserted head events** and avoids scanning a growing numeric offset. It does **not** freeze the complete query in a PostgreSQL MVCC snapshot across HTTP requests: a late backdated insert under the bookmark, or deletion/correction of older audit evidence, can still affect later pages. The frontend keeps its fail-closed 100ns chronology and UUID-tie checks. Do not claim transactional snapshot consistency or continuous live synchronization.

**Release decision:** block merge/deploy until SQL translation, exact-timestamp PostgreSQL tests, query-plan review, full React build and Playwright browser tests have actual passing evidence. #120 stays open and GitHub Actions #112 remains a blocker.
