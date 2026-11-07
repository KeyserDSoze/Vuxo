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

`--contracts` runs only three dependency-free Node 22 scripts in the real source checkout: `guardian-contracts.contract.test.mjs`, `portal-history-cursor.contract.test.mjs` and `portal-history-pagination.contract.test.mjs`. It does not require npm install, .NET, Docker, Chromium or PostgreSQL.

`--run` requires Node 22+, .NET **10 SDK**, npm, local frontend `node_modules` (TypeScript + `@playwright/test`), checked-out backend/tests, all targeted browser tests and a **dedicated NONPRODUCTION PostgreSQL connection** in `VUXO_TEST_POSTGRES_CONNECTION_STRING`. It runs the focused Node contracts, solution restore/build, xUnit cursor contract, both authenticated API suites, both real history PostgreSQL suites, real Guardian concurrency suite, complete frontend contract suite, React build and six focused Playwright specs. It **reads TRX counters** and refuses to call a .NET suite green when no tests ran, when cases were skipped or when tests failed. A failed preflight aborts before any test starts.

### Prepare an isolated test workstation

1. Clone/check out `integration/120-offworld-0.0.1` from the private repository with your normal GitHub credentials.
2. Install Node >=22, .NET 10 SDK and PostgreSQL **on a dedicated local/test service**. PostgreSQL integration tests create/drop a new `vuxo_it_...` database on the supplied cluster; never point the variable at production or shared player data.
3. In `src/frontend`, run `npm ci`, followed by `npx playwright install chromium` (install required OS browser dependencies if Playwright requests them). Then return to repository root.
4. Export `VUXO_TEST_POSTGRES_CONNECTION_STRING` using your OS's secret-safe environment setting. Its value must grant create/drop database on the isolated test PostgreSQL cluster. Never commit it, add it to a shared `.env`, or paste it in GitHub issues.
5. Execute `--check`; resolve every `MISSING` row. Then execute `--contracts` and `--run`. Logs do not include the connection string, and the test TRX directory is removed on completion.
6. Record actual pass/fail counts, PostgreSQL version and (redacted) `EXPLAIN (ANALYZE, BUFFERS)` evidence in GitHub issue #120. Execute the remaining full backend and browser regression gates before considering release.

### Safety and current validation

The runner itself was exercised locally with Node 22.16.0: **7/7 unit tests passed** covering help, missing dependency behavior, no credential echo, test-only mode, incomplete checkout rejection, full-run preflight refusal and unknown arguments. `node --check` passed. Local source Git blob IDs were verified against GitHub: `16bcf29ec71a3a0aec0240ce5cf295a62950e19b` for the CLI and `e00989e9e0a4615ce518e88bce479d447af8c9d2` for its unit test.

**NOT EXECUTED in the current environment:** the full `--run` workflow, real .NET C# tests, Npgsql/PostgreSQL SQL translation, React full build and Chromium Playwright. The local machine does not have .NET 10 SDK, a configured test PostgreSQL service or the full checked-out npm workspace. The runner alone cannot mark #120 done. Do not run GitHub Actions, merge `main` or deploy while #112 remains unresolved.
