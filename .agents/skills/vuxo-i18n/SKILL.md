---
name: vuxo-i18n
description: Add or change Vuxo user-facing text, localization resources, language preferences, API error codes or localized narrative content without coupling game rules to a locale.
---

# Vuxo i18n skill

Use this skill whenever a task adds visible text, labels, errors, quest/dialogue rendering or locale-specific behavior.

## Rules

- Frontend uses `i18next` + `react-i18next`.
- Maintain at least `it` and `en` for every new key.
- Do not hard-code visible React/MUI or Phaser UI strings when a translation key is appropriate.
- Keep translation keys semantic and stable; do not encode full prose into key names.
- Prefer namespaces by concern such as `common`, `auth`, `character`, `game`, `admin`, `errors`.
- Persist the player's language preference. Browser language may initialize it, but a deliberate player choice wins.
- Backend endpoints should return stable code + structured details rather than locale-specific error prose whenever practical.

## Dynamic/narrative content

Narrative content must preserve a canonical identity independent from presentation language.

For generated or localized quests/dialogues/stories, retain enough metadata to know:

- canonical content/narrative ID;
- locale requested/rendered;
- generation/template/rule version when applicable;
- source facts/IDs used to generate the text;
- audit correlation/causation IDs for player-affecting content.

Translation/localization may change wording only. It must never modify rewards, eligibility, world state, quest conditions, item IDs, probabilities or causal history.

## Workflow

1. Find the existing namespace/resource structure.
2. Add the key to Italian and English resources in the same change.
3. Replace visible literals with `t(...)`/the existing translation mechanism.
4. For backend errors, introduce/reuse a stable error code and translate client-side when possible.
5. Update Playwright coverage when language choice or visible behavior changes.
6. Test persistence across reload for preference-related changes.

## Review checklist

- Italian and English are both complete.
- No new user-facing literal was left behind accidentally.
- Fallback behavior is sensible.
- Game rules remain locale-independent.
- Generated narrative can be traced back to canonical state/content.
