# Vuxo Issue Lifecycle Skill

Use this skill whenever starting, updating, debugging or closing a non-trivial unit of work.

## Sources of truth

1. `AGENTS.md`
2. `docs/engineering/development-ledger.md`
3. `docs/engineering/issue-lifecycle.md`
4. the GitHub Issue itself
5. current `VERSION` and patch note

## Starting work

- Search for an existing issue before creating one.
- Use the Feature or Bug issue form when creating new work.
- Confirm target version, scope, acceptance criteria and test strategy.
- Add/update the ledger row to `In progress` before considering implementation active.
- Link child work to its EPIC/version when one exists.

## During work

Add issue comments only for meaningful project memory:
- architecture decisions;
- scope/acceptance changes;
- discovered root cause;
- blockers/dependencies;
- significant completed slices or verification results.

Keep the ledger short; do not duplicate full issue history there.

If blocked, set ledger status `Blocked` and state the exact dependency.

## Feature completion

Before closing:
- verify acceptance criteria;
- run the relevant xUnit/Playwright/integration/contract tests;
- confirm UI/theme/i18n requirements where applicable;
- confirm audit/telemetry/database docs where applicable;
- update the current patch note if the work belongs to the current release;
- update the ledger.

Add a final closure comment with: what changed, why closure is justified, verification/tests, version/patch note/commit or PR, and remaining limitations/debt.

## Bug completion

A bug fix should also include:
- root cause;
- a regression test that reproduces the defect before the fix when technically practical;
- confirmation that adjacent behavior was not weakened;
- the same final closure metadata as a feature.

## Non-completed closure

For `duplicate`, `not planned`, `deferred` or cancellation, explain the reason and link the replacing/future issue when applicable. Reflect the final state in the ledger.

## End-of-chat handoff

Before ending substantial work ensure:
- issue state/comments reflect reality;
- ledger reflects reality;
- CI/test status is recorded;
- patch note is current for release-bound changes;
- the next concrete action is obvious to the next chat/agent.
