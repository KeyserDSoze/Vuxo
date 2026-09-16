---
name: vuxo-ui
description: Build or refactor Vuxo React/MUI user interfaces, HUDs, menus and reusable visual components with light/dark themes, responsive layouts and Phaser boundaries.
---

# Vuxo UI skill

Use this skill whenever a task adds or changes visible UI.

## Before coding

1. Read `/AGENTS.md`.
2. Search `src/frontend` for an existing component/pattern before creating a new one.
3. Identify whether the UI belongs to MUI application chrome/HUD or to the Phaser world renderer. Do not mix responsibilities without a concrete reason.
4. Identify all UI states: default, hover/focus, loading, empty, error, disabled and mobile/narrow layout where relevant.

## Implementation rules

- Use MUI primitives and the project theme before custom CSS.
- Consume semantic theme values/tokens instead of literal colors. A component must remain usable in `light`, `dark` and `system` modes.
- Put repeated visual behavior into a shared component/hook rather than copying JSX/styles.
- Prefer composition over many near-identical variants.
- Keep game-world drawing/input inside Phaser; React/MUI may overlay HUD and menus but should not duplicate world state.
- Use responsive MUI APIs/breakpoints rather than desktop-only dimensions.
- Preserve keyboard operation, visible focus and useful accessible labels.
- Do not ship third-party artwork as final Vuxo assets. New game tiles/sprites are original project assets; code-generated placeholders are fine while a feature is incomplete.
- All visible copy must come from i18n; apply the `vuxo-i18n` skill in the same change.

## Reusable visual primitives

When a visual pattern is likely to appear in more than one screen, create a reusable primitive immediately. Typical candidates are:

- Vuxo page/screen shell
- game HUD panel/card
- stat/value row
- status/severity badge
- primary/secondary game action buttons
- dialog/sheet shell
- loading/empty/error state
- admin data panel
- character/avatar preview controls

Keep APIs semantic (`severity="warning"`, `stat="constitution"`) rather than styling-oriented (`yellow`, `padding12`).

## Testing

Add or update Playwright tests for the user-visible behavior. At minimum verify the affected route renders and critical interactions work. For reusable shell/theme work, include light/dark persistence and a narrow viewport smoke test.

## Completion check

Before finishing, verify:

- no duplicated visual pattern was introduced unnecessarily;
- no hard-coded user-facing copy was added;
- both themes remain readable;
- narrow/mobile layout is usable;
- Phaser still renders when the feature touches the game screen;
- Playwright covers the changed behavior.
