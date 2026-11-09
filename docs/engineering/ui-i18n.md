# UI design system and i18n

## Design tokens

The MUI shell uses `src/frontend/src/theme/tokens.ts` as the central source for:
- palette;
- typography;
- spacing;
- radius;
- elevation;
- breakpoints;
- shell layout constants.

Theme-specific focus and Phaser canvas colors are exported to CSS variables by `VuxoThemeProvider`.

New UI should prefer theme values or these tokens instead of introducing unrelated literal colors, radii or elevation values.

## Theme preference

The supported preference values are `system`, `light` and `dark`. Persistence is centralized in `preferences/uiPreferences.ts`.

Components do not read/write localStorage directly for theme/language. The adapter also exposes `readUiPreferences()`, which is the future synchronization boundary for a persisted player profile without coupling the current first playable to a profile-settings API.

## i18n

The frontend supports Italian and English with Italian fallback.

Prepared namespaces:
- `common`;
- `auth`;
- `character`;
- `game`;
- `admin`;
- `errors`.

The legacy `translation` bundle remains available during incremental migration. New feature code should use a dedicated namespace or canonical localizable content instead of hard-coded user-facing text.

The document `lang` attribute follows the active language. Unsupported persisted language values fall back to Italian and are normalized in storage.

## Accessibility

Interactive MUI buttons receive an explicit high-contrast focus ring for `.Mui-focusVisible`. Native focus-visible elements also use the theme focus CSS variable.

Shell navigation and icon-assisted theme/language controls expose accessible labels. Responsive behavior remains covered by existing mobile Playwright suites for auth, admin and world controls.

## Backend contract

The API returns stable machine-readable codes rather than translated domain errors. Contract tests verify that `Accept-Language: it-IT` and `en-US` produce the same error code.

Dynamic narrative follows `docs/engineering/narrative-localization.md`: authoritative rules/rewards/conditions live on the canonical decision, while localized text is a render carrying locale and render-version metadata.

## Mondo game-first (0.0.1, #154/#155)

La route `/game` usa la viewport `100dvh` residua sotto l'AppBar: il renderer Phaser non è una card da 960×540. La superficie `game-canvas` riempie l'host; `Scale.RESIZE` e `ResizeObserver` aggiornano le dimensioni in modo da ampliare/restringere i tile visibili senza distorcere gli sprite al cambio rapporto d'aspetto. I pannelli HUD, portali e controlli touch restano UI MUI sovrapposta e usano `--vuxo-game-hud-*` derivati dai token del tema.

Il pulsante fullscreen e la scorciatoia `F` usano la Fullscreen API sul contenitore che include HUD, Phaser e Dialog. `Escape` è gestito dal browser; non tentare di simulare `F11` programmaticamente. L'errore è localizzato IT/EN quando fullscreen viene rifiutato. La finestra portale usa il contenitore fullscreen come destinazione del Portal MUI per essere visibile anche in modalità immersiva.

Per la Home, il Rifugio, la cronologia e l'inventario: non tagliare contenuti per imporre artificialmente il no-scroll. La futura #154 prevede scroll **interni** a pannelli dichiarati, con vista del mondo e azioni principali sempre visibili.
