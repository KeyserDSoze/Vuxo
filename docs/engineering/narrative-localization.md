# Narrative localization contract

Vuxo keeps gameplay decisions separate from how narrative text is rendered in a player's locale.

## Canonical decision

Every dynamic quest, dialogue or story decision must have:

- a stable `NarrativeContentId`;
- a canonical content version;
- the rule version that produced the decision;
- canonical payload;
- reward and condition keys;
- correlation and optional causation IDs.

These fields belong to the authoritative game decision and are never translated.

## Localized render

A localized render contains:

- the same `NarrativeContentId`;
- the same canonical version and rule version;
- locale;
- render/localization version;
- localized text;
- the same correlation/causation metadata.

The render object has no API for changing reward keys, conditions or canonical rules. A translation or LLM adapter can produce text for a locale but cannot mutate the underlying `NarrativeDecision`.

## Audit

When localized narrative is persisted or emitted as an event, audit metadata must include content ID, canonical version, rule version, locale, render version, correlation ID and causation ID. The canonical decision remains the source of truth for rewards, conditions and state transitions.

The 0.0.1 foundation defines and tests this domain contract. Storage and caching of generated localized text belongs to the future narrative/quest engine.
