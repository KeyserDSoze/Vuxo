# VUXO — Off-world local QA without GitHub Actions

This is a **repeatable local test launcher, not deployment automation**. It works on Windows, macOS and Linux with Node 22+. Implemented under issue #120 while GitHub Actions quota blocker #112 is unresolved. The runner makes no GitHub API calls, creates no PR, changes no branches and does not publish the game.

## Commands (repository root)

```bash
node scripts/verify-offworld-local.mjs --help
node scripts/verify-offworld-local.mjs --check
node scripts/verify-offworld-local.mjs --contracts
node --test scripts/verify-offworld-local.test.mjs
node scripts/verify-offworld-local.mjs --run
```

`--check` returns **0** if all prerequisites are present, **2** for any missing prerequisite. A clean `--check` does **not** guarantee the PostgreSQL server is reachable or Chromium is installed; those get checked when `--run` actually executes.

`--contracts` runs seven dependency-free Node 22 scripts in the real source checkout: `guardian-contracts.contract.test.mjs`, `portal-history-cursor.contract.test.mjs`, `portal-history-pagination.contract.test.mjs`, `portal-history-navigation.contract.test.mjs`, `portal-history-view.contract.test.mjs`, `journal-adventure-navigation.contract.test.mjs` and `refuge-adventure-overview.contract.test.mjs`. It does not require npm install, .NET, Docker, Chromium or PostgreSQL.

`--run` requires Node 22+, .NET **10 SDK**, npm, installed frontend TypeScript and `@playwright/test`, the checked-out `Vuxo.sln` and all selected browser tests, a **dedicated NONPRODUCTION PostgreSQL connection** in `VUXO_TEST_POSTGRES_CONNECTION_STRING`, and explicit `VUXO_TEST_POSTGRES_ACK=disposable`. The acknowledgement prevents accidental launching when someone merely has a DB environment variable; **it does not prove that the cluster is not production**. Confirm the server/host and account yourself before setting it. The runner first executes its own Node QA unit tests, then the focused Guardian/history contracts, solution restore/build, xUnit cursor contract, two authenticated API suites, real history/Guardian PostgreSQL suites, frontend contracts, React build and six Playwright specs. It parses both actual **xUnit TRX counters** and **Playwright JSON reporter statistics**; the gate fails on missing reports, zero test cases, skipped, failed or flaky tests. A failed preflight aborts before any tests start.

### Prepare an isolated test workstation

1. Clone/check out `integration/120-offworld-0.0.1` from the private repository with your normal GitHub credentials.
2. Install Node >=22, .NET 10 SDK and PostgreSQL **on a dedicated local/test service**. PostgreSQL integration tests create/drop a new `vuxo_it_...` database on the supplied cluster; never point the variable at production or shared player data.
3. In `src/frontend`, run `npm ci`, followed by `npx playwright install chromium` (install required OS browser dependencies if Playwright requests them). Then return to repository root.
4. Export `VUXO_TEST_POSTGRES_CONNECTION_STRING` using your OS's secret-safe environment setting. It must connect **only to an isolated test cluster** with create/drop-database permission. Check its host manually. Only after validating that it is expendable, opt in with `VUXO_TEST_POSTGRES_ACK=disposable`. Examples (assumes the connection string is already securely configured):
   
   **Bash (Linux/macOS):**
   ```bash
   export VUXO_TEST_POSTGRES_ACK=disposable
   node scripts/verify-offworld-local.mjs --check
   ```
   
   **PowerShell (Windows):**
   ```powershell
   $env:VUXO_TEST_POSTGRES_ACK = 'disposable'
   node scripts/verify-offworld-local.mjs --check
   ```
   
   A typed acknowledgement is **not** a technical safeguard against targeting the wrong host. Never commit the connection string, add it to a shared `.env`, paste it in GitHub issues, or run these tests on the production cluster.
5. Execute `--check`; resolve every `MISSING` row. Then execute `--contracts` and `--run`. Logs do not include the connection string, and the test TRX directory is removed on completion.
6. Record actual pass/fail counts, PostgreSQL version and (redacted) `EXPLAIN (ANALYZE, BUFFERS)` evidence in GitHub issue #120. Execute the remaining full backend and browser regression gates before considering release.

### Safety and current validation

The runner itself was exercised locally with Node 22.16.0: **7/7 unit tests passed** covering help, missing dependency behavior, no credential echo, test-only mode, incomplete checkout rejection, full-run preflight refusal and unknown arguments. `node --check` passed. Local source Git blob IDs were verified against GitHub: `16bcf29ec71a3a0aec0240ce5cf295a62950e19b` for the CLI and `e00989e9e0a4615ce518e88bce479d447af8c9d2` for its unit test.

**NOT EXECUTED in the current environment:** the full `--run` workflow, real .NET C# tests, Npgsql/PostgreSQL SQL translation, React full build and Chromium Playwright. The local machine does not have .NET 10 SDK, a configured test PostgreSQL service or the full checked-out npm workspace. The runner alone cannot mark #120 done. Do not run GitHub Actions, merge `main` or deploy while #112 remains unresolved.


## Evidence from the hardened local gate (2026-11-07)

The launcher is split into three independently tested components: `verify-offworld-local.mjs`, `offworld-trx.mjs` and `offworld-playwright.mjs`. The full gate runs its own QA test suite before the application tests. A successful command exit is not sufficient for either test provider: the runner reads an actual TRX and an actual Playwright JSON file, requires at least one executed test, and rejects missing, skipped, failed, flaky, interrupted or malformed reports. Each report is stored only in a temporary local directory, removed on completion. The runner itself never prints the PostgreSQL connection string, but **third-party .NET/PostgreSQL error output may still contain sensitive details**; do not share unredacted logs.

**ACTUALLY EXECUTED locally on Node v22.16.0:** `node --test scripts/verify-offworld-local.test.mjs scripts/offworld-trx.test.mjs scripts/offworld-playwright.test.mjs`: **21/21 PASS** (9 CLI, 7 TRX and 5 Playwright-report tests). `node --check scripts/verify-offworld-local.mjs` PASS. `--check` with absent SDK, PostgreSQL and npm workspace exits 2 rather than giving a false green. Exact matched local/GitHub Git blobs:
- `verify-offworld-local.mjs` `f45618f5f31dddfa619dfde9c45cd8ee098e2fe8`
- `verify-offworld-local.test.mjs` `713b2d25395c9ce8bbba65ad15e9ccee5bcaf391`
- `offworld-trx.mjs` `57834fb46e161215ea51825a1083cbb48ded57e5`
- `offworld-trx.test.mjs` `3d6ea25f3e1d1a5f8d4693c7470b5b0c11f0dd1c`
- `offworld-playwright.mjs` `7272a832d0ed15c8cf3a75c986ca30b94c344623`
- `offworld-playwright.test.mjs` `23006e6699e2048d5f0d5bf26570e07ecc72ac14`

**NOT RUN:** full `--run`, .NET/xUnit, Npgsql/PostgreSQL, full Vite build and Playwright Chromium. Windows and macOS compatibility are implemented but not exercised on those operating systems. No Actions, merge or deployment.
