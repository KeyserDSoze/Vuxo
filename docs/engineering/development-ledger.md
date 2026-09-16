# Vuxo Development Ledger

Questo file è l'indice sintetico dello stato degli sviluppi. **GitHub Issues resta la fonte di dettaglio**: il ledger serve a una persona o a un nuovo coding agent per capire rapidamente cosa è attivo, pianificato, bloccato o completato.

## Stati ammessi

- `Planned`: definito ma non iniziato.
- `In progress`: lavoro attivo o foundation parzialmente implementata; la issue resta aperta.
- `Blocked`: non proseguibile senza una dipendenza esplicita.
- `Deferred`: valido ma rimandato a una versione successiva.
- `Done`: acceptance criteria completati e issue chiusa.
- `Duplicate`: assorbito da un'altra issue.
- `Cancelled`: non verrà realizzato; motivazione obbligatoria.

Quando una issue cambia stato in modo significativo, aggiornare la riga corrispondente. Il dettaglio, le decisioni e la chiusura restano nella issue.

## Versione corrente: 0.0.1

| Issue | Tipo | Versione | Area | Stato | Test/Stato verifica | Risoluzione / prossimo passo |
|---|---|---:|---|---|---|---|
| #20 | Epic | 0.0.1 | First playable | In progress | CI foundation verde | Coordinare le issue della first playable |
| #1 | Feature | 0.0.1 | Repository/quality | In progress | CI backend/frontend attiva | Chiudere solo dopo verifica completa acceptance criteria |
| #2 | Feature | 0.0.1 | Backend/API | In progress | Build/test backend verdi | Completare health/version/OpenAPI e relativi test |
| #3 | Feature | 0.0.1 | PostgreSQL/EF | Planned | Pending | Migration iniziale, persistence e integration test |
| #4 | Feature | 0.0.1 | Auth social | Planned | Pending | Microsoft + Google con identità Vuxo |
| #5 | Feature | 0.0.1 | Mock auth | Done | API integration xUnit + CI backend/frontend + Playwright verdi | Chiuso: mock login solo Development/Test, Production non mappata, ruoli e policy REST/SignalR verificati |
| #6 | Feature | 0.0.1 | Character | Done | Domain/Application/API xUnit + CI frontend/Playwright verdi | Chiuso: creazione autenticata, owner JWT, livello 0, 10 punti, statistiche derivate, error contract e singolo personaggio per owner |
| #7 | Feature | 0.0.1 | Character UI | Done | Domain/API xUnit + build frontend + 7 Playwright verdi | Chiuso: catalogo ID canonico validato dal backend, editor MUI responsive, preview SVG originale, draft persistito e submit autenticato |
| #8 | Feature | 0.0.1 | World generation | Done | Domain/Application/API xUnit + migration discovery + CI backend/frontend + 7 Playwright verdi | Chiuso: generatore v1 deterministico 16×16, bordi compatibili, walkability server-side, seed/versione persistiti, fingerprint chunk e API autenticata |
| #28 | Bug | 0.0.1 | PostgreSQL/EF | Done | CI backend build/test + frontend build + 7 Playwright verdi | Chiuso: metadata EF espliciti sulla migration iniziale e regression test offline su `Database.GetMigrations()` |
| #9 | Feature | 0.0.1 | SignalR/MMO | Done | Application xUnit + SignalR multi-client integration + CI backend/frontend verdi | Chiuso: Hub stateless, presence/reconnect, tick 20 Hz, input intent/rate-limit/sequence, velocità da Destrezza, collisioni su chunk #8 e delta server-side |
| #10 | Feature | 0.0.1 | Phaser multiplayer | Done | Frontend build + Playwright keyboard/reconnect/two-context/mobile + CI backend/frontend verdi | Chiuso: Phaser renderizza snapshot/delta autoritativi, invia solo intent, camera follow, smoothing, nomi/presence, reconnect e controlli touch responsive |
| #11 | Feature | 0.0.1 | Personal content | Planned | Pending | Grant, portali/dialoghi/ricompense personali auditabili |
| #12 | Feature | 0.0.1 | Audit/Admin | Planned | Pending | Event store e vista amministrativa |
| #13 | Feature | 0.0.1 | Observability | Planned | Pending | OpenTelemetry + stack self-hosted |
| #14 | Feature | 0.0.1 | Docker/IaC | In progress | Compose foundation presente | Completare runtime production e verifiche persistenti |
| #15 | Feature | 0.0.1 | CI/Pages | In progress | CI + Playwright verdi | Completare/validare deploy pubblico su vuxo.quest |
| #16 | Feature | 0.0.1 | Deploy backend | In progress | Build/push GHCR predisposti | Registrare runner `vuxo-prod` e validare deploy reale |
| #17 | Feature | 0.0.1 | Release/versioning | In progress | Quality gate VERSION/package/patch note verde | Completare About/version metadata end-to-end |
| #21 | Feature | 0.0.1 | UI/i18n | In progress | Build + Playwright tema/lingua verdi | Consolidare design system durante le prossime UI |
| #22 | Feature | 0.0.1 | Local LLM | In progress | Adapter/test foundation presenti | Validare smoke tool-calling sul server reale |
| #23 | Feature | 0.0.1 | Agent handbook | Done | CI completa verde | Chiuso: AGENTS/skills/multi-LLM governance completati |
| #24 | Feature | 0.0.1 | Handoff/issue lifecycle | Done | Governance check + backend xUnit + frontend build/Playwright verdi | Chiuso: prompt <=8000, ledger, Issue Forms, lifecycle, skill e AGENTS completati |
| #18 | Feature | post-0.0.1 | React Native/shared TS | Deferred | N/A | Riprendere dopo first playable |
| #19 | Feature | post-0.0.1 | Asset pipeline | Deferred | N/A | Riprendere dopo foundation asset 0.0.1 |

## Regola di aggiornamento

Una nuova feature o bug non banale deve avere una issue e una riga qui prima di essere considerata `In progress`. Alla chiusura aggiornare `Stato`, `Test/Stato verifica` e `Risoluzione / prossimo passo`, quindi aggiungere nella issue il commento finale previsto da `docs/engineering/issue-lifecycle.md`.
