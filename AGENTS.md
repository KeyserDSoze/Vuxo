# Vuxo Engineering Agent Guide

This file is the canonical repository-wide guide for AI coding agents and human contributors. Read it before making changes. If a more specific `AGENTS.md` exists closer to the files being edited, follow both and let the nearest file refine this one.

## Product and production endpoints

Vuxo is a persistent online 2D game built around exploration, procedural worlds, collectible creatures/items, strategic combat, portals, scripted PvE, PvP, player-specific adventures and auditable dynamic content.

Canonical production endpoints:

- Frontend: `https://vuxo.app`
- API: `https://api.vuxoapi.xyz`

Do not introduce alternative production URLs in code or documentation unless a migration is explicitly requested.

## Technology baseline

- Backend: .NET 10, ASP.NET Core, SignalR
- Persistence: PostgreSQL + Entity Framework Core, code-first migrations
- Cache/realtime scale-out: Redis
- Frontend: React + TypeScript + MUI
- 2D game renderer: Phaser
- Mobile direction: shared TypeScript contracts/domain logic where practical, with React Native prepared as a separate renderer/application surface
- Backend tests: xUnit
- Frontend/E2E tests: Playwright
- Local LLM runtime: Ollama behind `ILanguageModelGateway`; model/runtime must remain replaceable
- Packaging/runtime: Docker + Docker Compose
- CI/CD: GitHub Actions + GHCR + self-hosted production runner
- Frontend hosting: GitHub Pages custom domain `vuxo.app`
- Backend exposure: Cloudflare Tunnel to `api.vuxoapi.xyz`

## Architecture rules

1. The server is authoritative for gameplay state. Clients send intentions, not trusted positions, rewards or combat results.
2. Keep DDD boundaries clear: Domain contains game rules; Application orchestrates use cases; Infrastructure implements external concerns; API exposes transport endpoints.
3. Deterministic world/game generation must be seed-based and reproducible where possible.
4. Player-specific portals, dialogue, rewards and adventures must be traceable. Persist enough data to reconstruct why content was granted: player, rule/version, seed, correlation/causation IDs and timestamps.
5. Technical telemetry and gameplay/domain audit are separate concerns.
6. The LLM is never authoritative for geometry, permissions, rewards, inventory, economy or other game state. It may propose structured output/tool calls; the backend validates, authorizes and executes allow-listed tools.
7. The core game must degrade gracefully when the LLM is unavailable.
8. Secrets never belong in the repository, logs, frontend bundles or model prompts.

## Repository discovery before coding

Before changing behavior, inspect the repository instead of guessing. In this order:

1. Read this file and any nearer `AGENTS.md`.
2. Read `docs/engineering/development-ledger.md` to understand current work state.
3. Read the relevant skill under `.agents/skills/`.
4. Search existing code for the same concept/component/use case.
5. Read related tests; tests are executable documentation.
6. Read relevant files under `docs/architecture/`, `docs/engineering/` and the current patch notes.
7. Check the related GitHub issue/EPIC.

For a fresh project chat, `docs/engineering/chat-handoff-prompt.md` is the reusable handoff prompt. Repository state, `AGENTS.md`, current issues and tests have precedence if the prompt becomes stale.

Prefer extending an existing pattern over creating a parallel abstraction.

## Issue lifecycle and development ledger

Every non-trivial feature, bug fix, infrastructure change or developer-workflow change must be attached to a GitHub Issue. Search for an existing issue first; create one if none exists.

`docs/engineering/development-ledger.md` is the compact project status index. GitHub Issues remain the detailed source of truth.

Before implementation:
- ensure an issue exists with target version, objective/symptom, scope or reproduction, acceptance criteria and test strategy;
- set or add the ledger row to `In progress`;
- link the work to the current EPIC/version when applicable.

During implementation, update the issue when a meaningful architecture decision is made, scope changes, a blocker appears, a bug root cause is discovered, or a substantial slice/test is completed. Do not add comments for every trivial edit.

Do not close a feature or bug merely because code was written. Before closure verify acceptance criteria, relevant tests/CI, documentation, ledger, i18n/UI requirements when applicable and current release patch notes.

Every closed feature/bug must have a final issue comment containing:
- what was implemented/fixed;
- why closure is justified;
- tests/commands/CI and their results;
- target/current version and patch-note reference;
- relevant commit/PR when useful;
- remaining limitations or follow-up debt.

For bugs also record root cause and regression test. For `not planned`, `duplicate`, deferred or cancelled work, explicitly document the reason and replacement/future issue when applicable.

After closure update the ledger to `Done`, `Deferred`, `Duplicate` or `Cancelled` with concise verification/resolution notes.

Follow `docs/engineering/issue-lifecycle.md` and `.agents/skills/vuxo-issue-lifecycle/SKILL.md`.

## UI and design system

MUI is the application design system. Phaser renders the game world; MUI owns menus, HUD, forms, dialogs, character editor, admin views and non-world UI.

- Support `system`, `light` and `dark` themes.
- Use centralized theme/design tokens. Do not scatter raw colors, spacing constants or arbitrary typography through components.
- Reuse shared components before creating new variants. If a pattern is expected to recur, extract it into the shared UI layer immediately.
- Every screen must consider desktop and mobile layouts, keyboard access, visible focus, contrast, loading, empty and error states.
- Do not use third-party game art as final assets. Vuxo's map tiles, characters and game art are original project assets; generated code-only placeholders are acceptable during development.
- Follow `.agents/skills/vuxo-ui/SKILL.md` for UI work.

## Internationalization

All user-facing application text must use i18n from the first implementation.

- Frontend uses `i18next` + `react-i18next`.
- At minimum maintain Italian (`it`) and English (`en`).
- Do not hard-code user-facing strings in React/Phaser UI when a translation key can be used.
- Backend APIs should prefer stable machine-readable error/status codes and structured payloads over localized prose.
- Narrative content must have a canonical identity independent of language. Localization must never change conditions, rewards, causality or authoritative state.
- Follow `.agents/skills/vuxo-i18n/SKILL.md`.

## Testing is part of the feature

A feature is not complete without tests appropriate to its risk.

Backend:

- Use xUnit.
- Prefer `[Theory]` with `InlineData`, `MemberData` or equivalent for deterministic rule matrices.
- Test domain rules at the lowest sensible layer.
- Add integration/contract tests for persistence, external adapters and API boundaries when behavior depends on them.
- Use fakes for LLM calls in deterministic tests.

Frontend:

- Use Playwright for user-visible flows and regressions.
- Theme, language, responsive behavior and critical game shell flows require coverage.
- Preserve a working Phaser smoke test.

For procedural systems, test determinism: same seed + same version/rules must reproduce the same canonical result.

For a bug fix, add a regression test that fails before the fix when technically practical and passes after it.

Follow `.agents/skills/vuxo-testing/SKILL.md`.

## Release and version discipline

`VERSION` at repository root is the canonical release version. During the 0.0.x phase, use patch increments unless a different version is explicitly requested.

A version bump is required when opening a new release/version, not for every individual commit or issue. Work developed inside the current version keeps that version until the next release is opened.

Every release/version change must include all of the following in the same change set:

1. Bump `VERSION`.
2. Keep package/application version metadata synchronized where applicable.
3. Add or update `docs/patch-notes/<VERSION>.md` with user-visible and technical changes.
4. Ensure version endpoints/build metadata still expose version + commit + build time.
5. Run the full relevant test suite before considering the version releasable.

Every change intended for the current release must be reflected in the current patch note before that release is considered complete. Do not silently change release behavior without documenting it.

Follow `.agents/skills/vuxo-release/SKILL.md`.

## Database changes

- Entity Framework Core is code-first.
- Schema changes require migrations checked into source control.
- Migrations must be forward-safe and reviewed for data loss.
- An EF migration is not a PostgreSQL major-version upgrade. PostgreSQL major upgrades require an explicit backup/upgrade/rollback procedure.

## LLM integration

- Application code depends on an abstraction such as `ILanguageModelGateway`, never directly on Ollama-specific concepts.
- Tool schemas are versioned and allow-listed server-side.
- Validate tool arguments before execution and authorize the action against the current player/admin context.
- Never expose Ollama directly to the public internet or frontend.
- Audit model name/version when available, canonical prompt/context hash, requested tool, validated arguments, result and correlation/causation IDs for game-affecting flows.
- Prompts are not a substitute for domain rules.

Follow `.agents/skills/vuxo-llm/SKILL.md`.

## Definition of done for a feature

A normal feature should leave the repository with:

- domain/application/API/UI changes in the correct layers;
- no duplicated component or business-rule implementation when an existing abstraction can be reused;
- i18n keys for all user-facing text;
- light/dark compatibility;
- tests, preferably parameterized for rule combinations;
- observability/audit hooks where the behavior matters operationally or affects player state;
- documentation updated when architecture, operations or developer workflow changed;
- issue updated with meaningful progress and final closure information;
- development ledger synchronized with the real status;
- release/version/patch-note updates when the change is part of a new/current version.

## End-of-chat handoff

After substantial repository work, leave a future chat/agent a recoverable state:
- active issue reflects progress, blockers and decisions;
- development ledger reflects the same state;
- tests run or current CI status are recorded;
- patch note is updated for release-bound changes;
- the next concrete action is clear.

## Commands

Backend validation:

```bash
dotnet restore Vuxo.sln
dotnet build Vuxo.sln -c Release --no-restore
dotnet test Vuxo.sln -c Release --no-build
```

Frontend validation:

```bash
cd src/frontend
npm install
npm run build
npx playwright install chromium
npm run test:e2e
```

Local infrastructure:

```bash
cp docker/.env.example docker/.env
docker compose --env-file docker/.env -f docker/compose.dev.yml up -d
```

## Agent skills

Reusable repository workflows live in `.agents/skills/`:

- `vuxo-feature`: implement a vertical feature without skipping architecture/tests/docs
- `vuxo-ui`: build reusable MUI UI that works in light/dark and responsive layouts
- `vuxo-i18n`: add or change user-facing language safely
- `vuxo-testing`: design parameterized and E2E tests
- `vuxo-release`: bump version and patch notes consistently
- `vuxo-llm`: integrate local LLM/tool calling without leaking authority
- `vuxo-issue-lifecycle`: start/update/close feature and bug work while keeping issues and ledger synchronized

Use the relevant skill before starting that kind of work.
