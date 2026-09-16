---
name: vuxo-testing
description: Design and implement Vuxo tests for backend domain/application logic, procedural determinism, API/adapters and frontend user flows using xUnit and Playwright.
---

# Vuxo testing skill

Testing is part of implementation, not a cleanup phase.

## Backend strategy

- Use xUnit.
- Prefer `[Theory]` with `InlineData`, `MemberData` or strongly typed test cases for rule matrices.
- Domain rules should be tested without database/network dependencies.
- Application tests should use fakes for repositories/gateways when testing orchestration.
- Integration/contract tests cover PostgreSQL/EF, API contracts, SignalR boundaries and external adapters when those behaviors matter.
- LLM behavior in normal CI must use a fake `ILanguageModelGateway`; never make correctness depend on a stochastic live model.

For each deterministic rule test:

1. valid boundaries;
2. invalid boundaries;
3. minimum/maximum values;
4. representative combinations;
5. invariants that must never change silently.

## Procedural generation

Procedural systems require reproducibility tests. Capture at least:

- same seed + same rules/version => same canonical result;
- different seeds produce allowed variation;
- generated output satisfies structural invariants;
- generator version changes are explicit and auditable when they can alter persisted worlds.

Avoid snapshotting huge random outputs when smaller invariant assertions communicate the rule better.

## Frontend / E2E

Use Playwright for user-visible flows. Cover the behavior, not implementation details.

Critical shell regressions include:

- page loads and navigation;
- theme selection and persistence;
- language selection and persistence;
- responsive/narrow viewport usability;
- Phaser canvas still mounts;
- login/character/world flows as they are implemented;
- admin access control for administrative screens.

## Realtime

For multiplayer/realtime features, test the server-authoritative contract. Where practical simulate at least two clients and verify:

- presence/leave events;
- valid movement intentions;
- rejection/clamping of invalid speed/position attempts;
- synchronization without trusting client-owned world state.

## Completion commands

```bash
dotnet restore Vuxo.sln
dotnet build Vuxo.sln -c Release --no-restore
dotnet test Vuxo.sln -c Release --no-build

cd src/frontend
npm install
npm run build
npm run test:e2e
```

A feature is not complete if the relevant new tests are red, skipped without a documented reason, or absent.
