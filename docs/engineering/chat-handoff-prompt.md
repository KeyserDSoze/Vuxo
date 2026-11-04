# Vuxo — prompt di passaggio di consegna

> Copiare il contenuto del blocco seguente quando si apre una nuova chat nel progetto Vuxo. Il prompt è intenzionalmente inferiore a 8.000 caratteri e rimanda sempre alle fonti vive della repository.

```text
# Vuxo — prompt di passaggio di consegna

Stai lavorando sul progetto Vuxo nella repository `KeyserDSoze/Vuxo`. Prima di proporre o modificare codice, recupera lo stato reale della repository e NON affidarti solo a questo prompt.

## Prima di iniziare
1. Leggi `AGENTS.md`: è la guida canonica.
2. Leggi la skill pertinente in `.agents/skills/`.
3. Leggi `docs/engineering/development-ledger.md`.
4. Leggi la patch note della versione corrente indicata da `VERSION`.
5. Controlla la EPIC/versione corrente e le issue collegate.
6. Cerca codice, test e componenti esistenti prima di creare nuove astrazioni.
7. Se esiste già una issue per il lavoro richiesto, usa quella. Altrimenti crea una issue prima di iniziare un lavoro non banale.

## Prodotto
Vuxo è un gioco online 2D persistente di esplorazione, mondo procedurale, creature/oggetti/carte/mod collezionabili, Portali, PvE/PvP e contenuti personali tracciabili. Un giocatore può ricevere portali, dialoghi NPC, avventure e ricompense esclusivi; ogni decisione rilevante deve essere ricostruibile tramite player ID, regola/versione, seed, correlation/causation ID e timestamp.

La prima milestone è la first playable: login -> creazione personaggio -> ingresso nel mondo -> movimento -> presenza realtime di altri giocatori.

Domini production:
- frontend: `https://vuxo.app`
- API: `https://api.vuxoapi.xyz`

## Stack e principi
- Backend: .NET 10, ASP.NET Core, DDD, SignalR.
- Database: PostgreSQL + EF Core code-first.
- Cache/realtime scale-out: Redis.
- Frontend: React + TypeScript + MUI.
- Rendering 2D: Phaser.
- Mobile: predisporre condivisione TypeScript e futuro React Native, senza accoppiare Phaser a React Native.
- Test backend: xUnit, preferendo test parametrizzati con `[Theory]`.
- Test frontend/E2E: Playwright.
- Runtime LLM locale: Ollama tramite `ILanguageModelGateway`, modello sostituibile, tool calling validato/eseguito dal backend.
- Container: Docker/Compose.
- CI/CD: GitHub Actions + GHCR + self-hosted runner.
- Cloudflare Tunnel espone le API.
- Il server è autoritativo: i client inviano intenzioni, non posizioni/ricompense/risultati affidabili.
- Il gameplay core deve funzionare anche con LLM offline.

## UI, grafica e i18n
MUI è il design system applicativo; Phaser rende il mondo. Tutta la UI deve supportare `system`, light e dark tramite design token condivisi. Riusa sempre componenti grafici esistenti; se un pattern è destinato a ricorrere, estrailo subito nel layer condiviso invece di rifarlo.

Ogni testo visibile all'utente usa i18n fin dalla prima implementazione. Minimo IT/EN. Non hardcodare stringhe UI. Il backend preferisce codici errore/status stabili e payload strutturati. I contenuti narrativi hanno identità canonica indipendente dalla lingua; la traduzione non modifica condizioni, ricompense o stato.

Gli asset 2D finali sono originali Vuxo. Placeholder generati da codice sono ammessi.

## Personaggio iniziale
Livello iniziale 0. Il giocatore distribuisce esattamente 10 punti tra Forza, Destrezza, Intelligenza, Costituzione, Fortuna e Fede. Nessun valore negativo.
- `MaxHealth = Costituzione * 10`
- `MovementSpeedMultiplier = 1 + Destrezza * 0.10`
Gli altri attributi per ora sono predisposti ma non hanno ancora effetti.

Editor iniziale: nome, capelli/colore, viso, corporatura, colore pelle, maglia/colore, pantaloncini o gonna/colore, scarpe/tipo/colore.

## Workflow issue obbligatorio
Feature e bug devono essere tracciati tramite GitHub Issues.
- Prima di iniziare: collega il lavoro a una issue e aggiorna `docs/engineering/development-ledger.md` a `In progress`.
- Durante il lavoro: aggiorna la issue quando emerge una decisione architetturale, cambia lo scope, viene trovato un blocco o viene completato un passaggio importante. Non usare commenti per ogni modifica minima.
- Feature: descrivi obiettivo, scope, acceptance criteria, test e impatti su i18n/UI/audit/versione.
- Bug: descrivi sintomo, riproduzione, comportamento atteso, severità, causa quando nota, regression test e fix.
- Non chiudere una issue solo perché “sembra finita”.
- Prima della chiusura verifica acceptance criteria, test, documentazione, ledger e patch note quando applicabile.
- Quando chiudi feature o bug, aggiungi un commento finale che spiega: cosa è stato fatto; perché la issue viene chiusa; test eseguiti e risultati; limiti/debito residuo; commit/versione/patch note interessati. Per un bug indica anche causa e regression test. Se chiusa come `not planned` o `duplicate`, spiega esplicitamente il motivo.
- Aggiorna il ledger a `Done`, `Blocked`, `Deferred`, `Duplicate` o `Cancelled` con una breve risoluzione.

## Development ledger
`docs/engineering/development-ledger.md` è l'indice umano dello stato lavori, non sostituisce GitHub Issues. Deve permettere a una nuova chat di capire rapidamente cosa è attivo, cosa è stato completato, cosa è bloccato e perché. Ogni riga deve puntare alla issue e riportare almeno tipo, versione, area, stato, test e risoluzione/note. Mantienilo sintetico; i dettagli restano nella issue.

## Versioning e patch note
`VERSION` è la versione canonica. Durante 0.0.x usiamo normalmente bump patch. Quando si apre una NUOVA versione/release:
1. bump `VERSION`;
2. sincronizza metadata/package version;
3. crea/aggiorna `docs/patch-notes/<VERSION>.md`;
4. assicurati che backend/frontend espongano versione, commit e build time;
5. esegui la suite rilevante.
Non fare un bump per ogni commit: una feature può essere sviluppata dentro la versione corrente. Ogni modifica destinata alla release corrente deve essere riportata nella patch note corrente.

## Testing
Il test fa parte della feature/bugfix.
- Domain rule: xUnit al livello più basso sensato.
- Matrici deterministicamente testabili: `[Theory]`, `InlineData`/`MemberData`.
- Persistence/external adapter/API: integration/contract test quando opportuno.
- UI/flussi utente/regressioni: Playwright.
- Procedurale: stesso seed + stessa versione/regole => stesso risultato.
- Bugfix: aggiungi un regression test che fallisce prima del fix quando tecnicamente possibile.
Non indebolire quality gate o warning per far passare la CI.

## Come lavorare in questa chat
All'inizio riassumi in poche righe: versione corrente, issue attiva, stato ledger, obiettivo del turno e dipendenze/blocchi reali. Poi lavora direttamente sulla repository. Mantieni la issue e il ledger sincronizzati mentre procedi. Usa la CI come verifica reale. Se trovi incongruenze tra questo prompt e la repository, `AGENTS.md`, issue correnti e codice/test aggiornati hanno precedenza; correggi anche la documentazione se necessario.

Al termine del turno lascia il progetto in uno stato riprendibile: issue aggiornata, ledger aggiornato, test eseguiti o stato CI riportato, patch note aggiornata se il cambiamento appartiene alla release corrente, e una breve nota su quale sia il prossimo passo concreto.
```
