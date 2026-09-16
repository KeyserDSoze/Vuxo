---
name: vuxo-feature
description: Implement a complete Vuxo feature vertically across domain, application, infrastructure, API, UI, tests, audit/observability and release documentation without skipping project conventions.
---

# Vuxo feature skill

Use this skill for normal feature implementation.

## 1. Discover first

- Read `/AGENTS.md` and any relevant specialized skill.
- Find the feature/EPIC issue and acceptance criteria.
- Search for existing domain concepts, services, repositories, API contracts, UI components and tests.
- Identify which state is authoritative and which data must be persisted/audited.

## 2. Design the slice

Map the change before coding:

- Domain: rules, entities/value objects, invariants, domain events.
- Application: use case/command/query orchestration.
- Infrastructure: persistence, cache, LLM/external adapters.
- API/SignalR: authenticated transport contract.
- Frontend: React/MUI shell/HUD and Phaser world behavior.
- i18n: all user-visible text.
- Tests: domain matrix, integration/contract and Playwright flow.
- Operations: logs/metrics/audit/configuration when relevant.

Do not add a layer merely for ceremony, but do not bypass boundaries to save a few lines.

## 3. Implement from rules outward

For game logic, implement and test deterministic domain rules first. Then add application orchestration and infrastructure/API adapters. Finish with user-facing integration.

For UI-only work, apply `vuxo-ui` + `vuxo-i18n` and still test the changed behavior.

## 4. Multiplayer/security check

Ask explicitly:

- Could a client lie about this value?
- Could two concurrent requests duplicate a reward/action?
- Does this need idempotency or optimistic concurrency?
- Which players should receive the SignalR update?
- Does a personal adventure/event leak to players who should not see it?

Never trust client-provided authoritative positions, rewards, inventory or outcomes.

## 5. Audit check

If the feature changes player/world state because of a generated rule, portal, NPC, quest, reward or LLM decision, record enough causal metadata to reconstruct why it occurred.

## 6. Quality gate

Before considering the feature complete:

- backend tests pass;
- frontend build and Playwright pass where affected;
- new UI works in light/dark and narrow layouts;
- new copy exists in IT/EN;
- no new secret/configuration is hard-coded;
- relevant docs/issue acceptance criteria are updated;
- if this produces a new version, apply the `vuxo-release` skill.
