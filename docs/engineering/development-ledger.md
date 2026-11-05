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
| #70 | Epic | 0.0.1+ | Off-world gameplay and Refuge | In progress | Architettura/design in docs/game-design/off-world-refuge.md; slice #71 in CI | Cura autorevole #72 e minigiochi a reward #73 pianificati; no client-authoritative economy |
| #71 | Feature | 0.0.1 | Refuge hub and free rune training | Done | PR #74 CI #41942702087: 68/68 Playwright, build/backend/Docker verdi; live E2E #41942702124 verde | Rifugio e allenamento rune 3/4/6, nav/mobile/i18n, nessun reward locale; merge/closure #71 |
| #72 | Feature | 0.0.1+ | Server-authoritative healing/rest | Planned | HP corrente non persistito nel character model | Domain rules, migrazione EF, API atomica/audit, UI e test prima di cura reale |
| #73 | Feature | 0.0.1+ | Server-authoritative rewarded activities | Planned | Design in docs/game-design/off-world-refuge.md | Versioned runs, anti-replay, ricompense atomiche e test gameplay |
| #68 | Bug/UX | 0.0.1 | Account provider configuration recovery | Done | PR #69, CI #41939136547: 62/62 Playwright, backend/Docker verdi; live E2E #41939136559 verde | Retry IT/EN accessibile e responsive; recupero 503→200 senza reload, empty state provider disattivati |
| #66 | Bug/UX | 0.0.1 | Account session synchronization | Done | PR #67 merged a810037a; CI #41938415560, 60 Playwright + live E2E verdi | Cross-tab session hook, scadenza/focus, provider on demand, logout race-safe; issue chiusa |
| #64 | Performance | 0.0.1 | Phaser route code splitting | Done | PR #65 merged a41dc8e4; CI #41936884402, 56 Playwright e live E2E verdi | React.lazy GamePage/AdminRoute; JS iniziale gzip 645,21 → 287,67 kB (-55,4%); issue chiusa |
| #62 | Bug/UX | 0.0.1 | Frontend home + shell + admin navigation | Done | PR #63 merged 9a42e793; CI #41935830789, 54 Playwright e live E2E verdi | Home responsive, menu role-aware, test Phaser stabile, i18n e diagnostica; issue chiusa |
| #59 | Feature | 0.0.1 | Raspberry Pi 3 ARM64 production | In progress | CI shell/Compose contract aggiunto, esecuzione CI e hardware ARM64 da verificare | Overlay runtime a risorse limitate, GitHub Actions ARM64 gated, backup/rollback API e setup documentati; in attesa di runner reale, benchmark RAM, reboot e restore |
| #56 | Feature | 0.0.1 | Inventory stacks + equipment | Done | PR #57: CI #41832392048 verde (267 xUnit, 40 Playwright, Docker runtime 0 warning/error), live E2E #41832392114 verde (2 browser/API/PostgreSQL) | Mergiata su main 535a8c3a: stacking non distruttivo, due slot relic/charm, equip/unequip e audit atomici, owner FK e bonus server preview IT/EN; live multiplayer modifiers follow-up separato |
| #54 | Feature | 0.0.1 | Inventario e reward atomici | Done | PR #55: CI #41829008483 verde (256 xUnit, 37 Playwright, Docker runtime 0 warning/error), live E2E #41829008801 verde (2 browser/API/PostgreSQL, rollback e unique award) | Mergiata su main b695cd0f: reward allowlisted, migrazione additiva, inventario owner-only, premio una sola volta con audit e UI IT/EN; follow-up stacking/equip/marketplace |
| #52 | Feature | 0.0.1 | Portali interattivi Phaser | Done | PR #53: CI #41825361831 verde (241 xUnit, 34 Playwright, Docker runtime, 0 warning/error), E2E reale #41825361835 verde (2 browser/SignalR/API/PostgreSQL) | Mergiata su main commit 8dc3ebcb: marker privati raggiungibili, click Phaser/MUI, vicinanza server-authoritative, dialog #50 IT/EN; follow-up: portali interni e reward inventario |
| #50 | Feature | 0.0.1 | Personal portal challenges | Done | PR #51: CI 41820932823 verde (224 xUnit, 30 Playwright, Docker runtime, 0 warning/error); live browser/API/PostgreSQL 41820932878 verde | Mergiata su main come 50a7d154: sfida 4 rune seed-based, API owner-only, replay/consume bypass bloccati, UI IT/EN responsive, audit e consumo persistente; prossimi sviluppi: portali Phaser e inventario |
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
| #16 | Feature | 0.0.1 | Deploy backend | In progress | Build/push GHCR predisposti | Registrare runner `vuxo-prod` e validare deploy reale |
| #17 | Feature | 0.0.1 | Release/versioning | Done | Release/foundation gate + built version.json + Version/About + update notifier Playwright + CI completa verdi | Chiuso: VERSION canonico, metadata frontend/backend visibili, SemVer documentato, local fallback e nuova-build notification senza refresh forzato |
| #21 | Feature | 0.0.1 | UI/i18n | Done | MUI token + theme/lang persistence + namespace i18n + accessibility + API locale contract + narrative localization tests + CI verde | Chiuso: design system/i18n foundation end-to-end; storage/cache narrativa resta al futuro quest engine |
| #22 | Feature | 0.0.1 | Local LLM | Done | Application/API/Infrastructure xUnit + Docker privacy/model contract + CI frontend/Playwright verdi | Chiuso: Ollama replaceable, tool allow-list server-side, audit, bounded rounds, resilience e graceful degradation; live-model smoke resta operativo/non deterministico |
| #23 | Feature | 0.0.1 | Agent handbook | Done | CI completa verde | Chiuso: AGENTS/skills/multi-LLM governance completati |
| #24 | Feature | 0.0.1 | Handoff/issue lifecycle | Done | Governance check + backend xUnit + frontend build/Playwright verdi | Chiuso: prompt <=8000, ledger, Issue Forms, lifecycle, skill e AGENTS completati |
| #18 | Feature | post-0.0.1 | React Native/shared TS | Deferred | N/A | Riprendere dopo first playable |
| #19 | Feature | post-0.0.1 | Asset pipeline | Deferred | N/A | Riprendere dopo foundation asset 0.0.1 |

## Regola di aggiornamento

Una nuova feature o bug non banale deve avere una issue e una riga qui prima di essere considerata `In progress`. Alla chiusura aggiornare `Stato`, `Test/Stato verifica` e `Risoluzione / prossimo passo`, quindi aggiungere nella issue il commento finale previsto da `docs/engineering/issue-lifecycle.md`.
