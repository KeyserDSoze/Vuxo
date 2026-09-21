# Release e versioning

`VERSION` è la fonte canonica SemVer di Vuxo. La stessa versione deve essere sincronizzata nel package frontend e deve avere una patch note in `docs/patch-notes/<VERSION>.md`.

## Convenzione SemVer

- **patch** (`0.0.x`): correzioni compatibili, hardening, bugfix e miglioramenti interni senza nuovo contratto funzionale incompatibile;
- **minor** (`0.x.0`): nuove funzionalità compatibili o ampliamenti rilevanti della first playable;
- **major** (`x.0.0`): cambi incompatibili di contratto, formato persistito o comportamento pubblico che richiedono una migrazione esplicita.

Ogni bump deve aggiornare nello stesso change set `VERSION`, i metadata committati che duplicano la versione, la patch note corrispondente e gli eventuali riferimenti operativi.

## Metadata di build

Il frontend genera `version.json` durante `npm run build` con:
- `version` da `VERSION`;
- `commit` da `GITHUB_SHA` in CI oppure `local` fuori da GitHub Actions;
- `buildDateUtc` come timestamp ISO UTC della build.

La CI verifica il file realmente prodotto in `dist/version.json`, non soltanto i file sorgente.

Il backend espone `/api/meta/version` con versione assembly/informational version, commit, data build UTC e ambiente. Commit e data production vengono forniti dal workflow di deploy; le build locali continuano a funzionare con metadata locali.

## Version/About

La pagina `/version` mostra i metadata della build frontend caricata e prova a leggere i metadata del backend configurato. Il backend può essere temporaneamente non disponibile senza rendere inutilizzabile la pagina.

## Nuova build frontend disponibile

La SPA conserva come riferimento il primo `version.json` caricato. Quando la finestra torna in focus e periodicamente durante una sessione lunga, il client richiede `version.json` con cache disabilitata. Se versione, commit o data build differiscono, mostra una notifica e lascia all'utente la scelta di ricaricare. Non viene eseguito alcun refresh forzato durante il gameplay.
