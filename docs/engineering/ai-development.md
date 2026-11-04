# Sviluppo Vuxo con coding agent e LLM

Questa guida spiega come un nuovo sviluppatore o coding agent deve recuperare contesto e lavorare sul repository senza introdurre convenzioni parallele.

## Fonte canonica

`/AGENTS.md` è la fonte canonica delle regole di engineering del progetto.

Gli altri file di istruzione (`.github/copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`) devono restare sottili e puntare a `AGENTS.md`, in modo che le regole non divergano tra strumenti.

GitHub Copilot supporta inoltre istruzioni specifiche per path sotto `.github/instructions/`; Vuxo le usa per frontend, backend e test.

## Ordine con cui recuperare informazioni

Prima di implementare una modifica:

1. leggere `AGENTS.md` e l'eventuale `AGENTS.md` più vicino ai file da modificare;
2. leggere la skill pertinente in `.agents/skills/`;
3. cercare nel codice un'implementazione analoga;
4. leggere i test del componente/regola: sono documentazione eseguibile;
5. leggere la documentazione in `docs/architecture/` e `docs/engineering/`;
6. leggere l'issue/EPIC collegata alla feature;
7. leggere la patch note della versione corrente per capire cosa è già incluso nella release in costruzione.

Un agent non deve inventare una nuova convenzione se il repository ne contiene già una equivalente.

## Skill disponibili

Le skill sono workflow riutilizzabili, non semplici descrizioni:

- `vuxo-feature`: vertical slice completo di una feature;
- `vuxo-ui`: MUI/design system, temi, responsive e confine con Phaser;
- `vuxo-i18n`: testi UI, error code e contenuti narrativi localizzabili;
- `vuxo-testing`: xUnit parametrico, Playwright, realtime e procedural determinism;
- `vuxo-release`: version bump, patch note e validazione release;
- `vuxo-llm`: gateway LLM, tool calling, audit e limiti low-resource.

Quando nasce un workflow ripetitivo nuovo, va trasformato in una skill invece di copiare istruzioni nei prompt delle singole sessioni.

## UI come sistema, non come pagina singola

La UI applicativa usa React + MUI; Phaser disegna il mondo 2D.

Ogni nuova schermata deve prima cercare componenti condivisi esistenti. Se un pattern è destinato a ricomparire (panel HUD, stat row, status badge, dialog shell, empty/error state, character control), va promosso a componente riutilizzabile.

Le scelte visuali passano dai token del tema e devono funzionare in `system`, `light` e `dark`. Non si introducono colori hard-coded sparsi per risolvere una singola schermata.

## i18n come requisito di base

Ogni stringa user-facing entra tramite i18n fin dalla prima implementazione. Le lingue base sono italiano e inglese.

Per errori API si preferiscono code stabili e payload strutturati. Quest, dialoghi e contenuti generati mantengono un'identità canonica indipendente dalla lingua; la traduzione non può cambiare regole, ricompense o causalità.

## Test come Definition of Done

Backend: xUnit, con `[Theory]`/dati parametrizzati per matrici di regole dove possibile.

Frontend: Playwright per flussi visibili e regressioni di shell, tema, lingua, responsive e Phaser.

Sistemi procedurali: stessa seed + stessa versione delle regole deve riprodurre lo stesso risultato canonico.

LLM: i test normali usano fake deterministici; il modello reale è verificato tramite test di adapter/smoke separati e non deve rendere la CI stocastica.

## Release discipline

`VERSION` è la fonte canonica. La CI verifica che:

- `VERSION` sia un semver valido;
- `src/frontend/package.json` esponga la stessa versione;
- esista `docs/patch-notes/<VERSION>.md`.

Quando si crea una nuova versione si usa la skill `vuxo-release`: bump, metadata sincronizzati, nuova patch note, test e note operative devono viaggiare insieme.

## Domini production

- Frontend: `https://vuxo.app`
- API: `https://api.vuxoapi.xyz`

Il frontend viene pubblicato con GitHub Pages e custom domain, quindi il build production usa base path `/`. Il backend è pubblicato attraverso Cloudflare Tunnel; il tunnel è esposizione applicativa, non un canale di deploy/amministrazione.

## Principio per prompt e agent futuri

I prompt non devono contenere copie complete delle convenzioni del progetto. Devono dire all'agent di leggere `AGENTS.md` e la skill pertinente. In questo modo le regole evolvono in un posto solo e restano utilizzabili da Copilot, Codex, Claude, Gemini o altri agent che supportano istruzioni repository/file-based.
