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
| #47 | Bug | 0.0.1 | NuGet SignalR/MessagePack audit | Done | PR #48 CI verde: backend xUnit, frontend Playwright e Docker runtime; commit main fe8de782 con pacchetti ASP.NET Core/SignalR 10.0.13 verificati | Chiuso dopo porting del fix su main; audit NuGet con warnings-as-errors mantenuto |
| #20 | Epic | 0.0.1 | First playable | In progress | CI foundation verde | Coordinare le issue della first playable |
| #1 | Feature | 0.0.1 | Repository/quality | Done | Foundation gate + backend/xUnit/PostgreSQL + Docker runtime + frontend/Playwright verdi | Chiuso: struttura monorepo, stack, warnings-as-errors, CI, README/version metadata e guard sui file locali sensibili sono verificati automaticamente |
| #2 | Feature | 0.0.1 | Backend/API | Done | API integration health/version/OpenAPI + PostgreSQL/OTLP + Docker runtime + frontend/Playwright verdi | Chiuso: Release build, health/version contract, OpenAPI Development-only, fail-fast DB config, migration startup production-like e Production senza mock auth verificati |
| #3 | Feature | 0.0.1 | PostgreSQL/EF | Done | PostgreSQL 17 integration + migration/round-trip/unique/event query + pg_dump/pg_restore + CI completa verdi | Chiuso: DB vuoto migra allo schema corrente, personaggio/eventi persistono su PostgreSQL reale, vincolo owner verificato e backup/restore documentato e provato |
| #4 | Feature | 0.0.1 | Auth social | Done | Application/API/PostgreSQL + MSAL/GIS frontend + Playwright login/logout/i18n + Docker/CI verdi | Chiuso: Microsoft/Google verificati server-side, identità Vuxo persistente, JWT Vuxo, rate limit, audit redatto e provider token non persistiti |
| #5 | Feature | 0.0.1 | Mock auth | Done | API integration xUnit + CI backend/frontend + Playwright verdi | Chiuso: mock login solo Development/Test, Production non mappata, ruoli e policy REST/SignalR verificati |
| #6 | Feature | 0.0.1 | Character | Done | Domain/Application/API xUnit + CI frontend/Playwright verdi | Chiuso: creazione autenticata, owner JWT, livello 0, 10 punti, statistiche derivate, error contract e singolo personaggio per owner |
| #7 | Feature | 0.0.1 | Character UI | Done | Domain/API xUnit + build frontend + 7 Playwright verdi | Chiuso: catalogo ID canonico validato dal backend, editor MUI responsive, preview SVG originale, draft persistito e submit autenticato |
| #8 | Feature | 0.0.1 | World generation | Done | Domain/Application/API xUnit + migration discovery + CI backend/frontend + 7 Playwright verdi | Chiuso: generatore v1 deterministico 16×16, bordi compatibili, walkability server-side, seed/versione persistiti, fingerprint chunk e API autenticata |
| #28 | Bug | 0.0.1 | PostgreSQL/EF | Done | CI backend build/test + frontend build + 7 Playwright verdi | Chiuso: metadata EF espliciti sulla migration iniziale e regression test offline su `Database.GetMigrations()` |
| #9 | Feature | 0.0.1 | SignalR/MMO | Done | Application xUnit + SignalR multi-client integration + CI backend/frontend verdi | Chiuso: Hub stateless, presence/reconnect, tick 20 Hz, input intent/rate-limit/sequence, velocità da Destrezza, collisioni su chunk #8 e delta server-side |
| #10 | Feature | 0.0.1 | Phaser multiplayer | Done | Frontend build + Playwright keyboard/reconnect/two-context/mobile + CI backend/frontend verdi | Chiuso: Phaser renderizza snapshot/delta autoritativi, invia solo intent, camera follow, smoothing, nomi/presence, reconnect e controlli touch responsive |
| #11 | Feature | 0.0.1 | Personal content | Done | Domain/Application/API + migration discovery + CI backend verde; frontend quality gate invariato | Chiuso: grant Player-scoped persistente, portale/dialogo/ricompensa owner-only, seed/rule storici, audit causale, scadenza e consumo persistente |
| #12 | Feature | 0.0.1 | Audit/Admin | Done | Application/API/Infrastructure xUnit + frontend build + Playwright admin + CI backend/frontend verdi | Chiuso: event store interrogabile, filtri/paginazione, payload versionati, dashboard Administrator i18n IT/EN, guard ruolo e online snapshot autoritativo |
| #13 | Feature | 0.0.1 | Observability | Done | OpenTelemetry unit/API + production Collector health + OTLP smoke + frontend build/Playwright + Compose validation verdi | Chiuso: trace/metriche/log OTLP, Npgsql telemetry, correlation/player enrichment, redazione dati sensibili, stack Grafana/Prometheus/Loki/Tempo opzionale e dashboard admin i18n |
| #14 | Feature | 0.0.1 | Docker/IaC | Done | CI Docker runtime smoke + backend + frontend/Playwright verdi | Chiuso: runtime-only API image, dev/prod health, DB/cache privati, Cloudflare `api:8080`, named-volume persistence verificata dopo recreate |
| #15 | Feature | 0.0.1 | CI/Pages | In progress | CI + Playwright verdi | Completare/validare deploy pubblico su vuxo.quest |
| #16 | Feature | 0.0.1 | Deploy backend self-hosted | In progress | Script bootstrap systemd/x64 recuperato; workflow deploy/Compose modernizzati, CI contratti Linux aggiunta ma ancora da verificare | Nuova PR sostituisce la #29 divergente senza perdere volumi; dopo CI servono bootstrap reale, secret production, Cloudflare, reboot, rollback |
| #17 | Feature | 0.0.1 | Release/versioning | Done | Release/foundation gate + built version.json + Version/About + update notifier Playwright + CI completa verdi | Chiuso: VERSION canonico, metadata frontend/backend visibili, SemVer documentato, local fallback e nuova-build notification senza refresh forzato |
| #21 | Feature | 0.0.1 | UI/i18n | Done | MUI token + theme/lang persistence + namespace i18n + accessibility + API locale contract + narrative localization tests + CI verde | Chiuso: design system/i18n foundation end-to-end; storage/cache narrativa resta al futuro quest engine |
| #22 | Feature | 0.0.1 | Local LLM | Done | Application/API/Infrastructure xUnit + Docker privacy/model contract + CI frontend/Playwright verdi | Chiuso: Ollama replaceable, tool allow-list server-side, audit, bounded rounds, resilience e graceful degradation; live-model smoke resta operativo/non deterministico |
| #23 | Feature | 0.0.1 | Agent handbook | Done | CI completa verde | Chiuso: AGENTS/skills/multi-LLM governance completati |
| #24 | Feature | 0.0.1 | Handoff/issue lifecycle | Done | Governance check + backend xUnit + frontend build/Playwright verdi | Chiuso: prompt <=8000, ledger, Issue Forms, lifecycle, skill e AGENTS completati |
| #18 | Feature | post-0.0.1 | React Native/shared TS | Deferred | N/A | Riprendere dopo first playable |
| #19 | Feature | post-0.0.1 | Asset pipeline | Deferred | N/A | Riprendere dopo foundation asset 0.0.1 |

## Regola di aggiornamento

Una nuova feature o bug non banale deve avere una issue e una riga qui prima di essere considerata `In progress`. Alla chiusura aggiornare `Stato`, `Test/Stato verifica` e `Risoluzione / prossimo passo`, quindi aggiungere nella issue il commento finale previsto da `docs/engineering/issue-lifecycle.md`.
