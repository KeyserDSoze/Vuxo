---
applyTo: "src/backend/**/*.cs,tests/backend/**/*.cs"
---

Follow `/AGENTS.md`. Keep Domain free of infrastructure/vendor concerns; Application orchestrates use cases; Infrastructure implements persistence/external adapters; API owns transport/authentication concerns.

Gameplay state is server-authoritative. New deterministic rules require xUnit coverage, preferably parameterized. Persist/audit player-affecting dynamic decisions. LLM output is never authoritative and all tool execution remains server-side, validated and allow-listed.
