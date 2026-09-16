# Vuxo Copilot instructions

Read and follow `/AGENTS.md` before making changes. Treat it as the canonical repository-wide engineering guide.

Before coding, inspect the relevant existing implementation, tests, architecture documentation and GitHub issue. Use the applicable reusable workflow under `/.agents/skills/`:

- `vuxo-feature` for vertical feature work
- `vuxo-ui` for React/MUI/Phaser-facing UI
- `vuxo-i18n` for user-facing text and localization
- `vuxo-testing` for xUnit/Playwright coverage
- `vuxo-release` for version/patch-note work
- `vuxo-llm` for local LLM/tool-calling integration

Never skip tests, i18n, theme compatibility or release documentation simply because the requested code change is small. Prefer existing project patterns and shared components over parallel implementations.
