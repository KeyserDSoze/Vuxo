---
applyTo: "tests/**/*,src/frontend/tests/**/*"
---

Follow `/AGENTS.md` and `.agents/skills/vuxo-testing/SKILL.md`.

Tests are executable documentation. Prefer parameterized xUnit cases for deterministic rule matrices and Playwright flows for user-visible behavior. Procedural generation must test seed reproducibility and invariants. Never make normal CI depend on a live stochastic LLM; use a fake gateway and separate contract/smoke coverage for the real adapter.
