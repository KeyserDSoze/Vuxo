---
applyTo: "src/frontend/**/*.{ts,tsx,css},src/shared/**/*.ts"
---

Follow `/AGENTS.md` and `.agents/skills/vuxo-ui/SKILL.md` for UI work and `.agents/skills/vuxo-i18n/SKILL.md` for text.

React/MUI owns application UI and Phaser owns the world renderer. Reuse theme tokens and shared components; do not introduce ad-hoc hard-coded colors or user-facing strings. Every user-visible flow must work in light/dark themes, Italian/English and responsive layouts. Update Playwright coverage for changed behavior.
