# Vuxo

Vuxo è un gioco online 2D di esplorazione, collezione e combattimento strategico in un mondo procedurale persistente. La prima milestone (`0.0.1`) porta il giocatore da login e creazione del personaggio all'ingresso in un mondo condiviso, con movimento realtime server-authoritative e presenza degli altri giocatori.

## Endpoint production canonici

- Frontend: `https://vuxo.quest`
- API: `https://api.vuxoapi.xyz`

Il frontend è pubblicato tramite GitHub Pages sul dominio custom `vuxo.quest`. Il backend viene eseguito sul server self-hosted e pubblicato tramite Cloudflare Tunnel su `api.vuxoapi.xyz`.

## Stack iniziale

- Backend: .NET 10 / ASP.NET Core / SignalR
- Persistenza: PostgreSQL + Entity Framework Core
- Cache e realtime scale-out: Redis
- Frontend: React + TypeScript + Phaser + MUI
- UI: design system responsive, tema system/light/dark, i18n con italiano e inglese
- LLM locale: Ollama containerizzato dietro `ILanguageModelGateway`, modello configurabile e tool calling server-side
- Test backend: xUnit, con integration test PostgreSQL reali e test parametrizzati dove applicabile
- Test frontend/E2E: Playwright
- Container: Docker + Docker Compose
- Observability: OpenTelemetry + stack opzionale Grafana/Prometheus/Loki/Tempo
- Frontend hosting: GitHub Pages
- Backend hosting: server self-hosted esposto tramite Cloudflare Tunnel
- CI/CD: GitHub Actions + GHCR + GitHub self-hosted runner

## Versione e patch note

La versione corrente è letta dal file root `VERSION`, che è la fonte canonica della versione applicativa.

Le patch note sono versionate in `docs/patch-notes/`. Ogni nuova versione deve includere nello stesso change set:

1. bump di `VERSION`;
2. sincronizzazione degli altri metadati di versione committati, quando applicabile;
3. creazione/aggiornamento di `docs/patch-notes/<VERSION>.md`;
4. test verdi;
5. eventuali note operative per migrazioni/configurazione/deploy.

Ogni build espone versione, commit e data di build. La convenzione SemVer, i metadata locali/CI e il rilevamento di nuove build frontend sono documentati in `docs/engineering/release-versioning.md`.

## Struttura

```text
src/
  backend/
    domains/
    infrastructure/
    business/
    applications/
  frontend/
  mobile/
  shared/
tests/
docs/
docker/
infra/
.agents/skills/
.github/ISSUE_TEMPLATE/
.github/instructions/
.github/workflows/
AGENTS.md
```

## Quality gate della repository

La CI tratta la struttura e le convenzioni della foundation come un contratto verificabile, non come semplice documentazione. `scripts/verify-repository-foundation.mjs` controlla le directory canoniche, .NET 10 con warning trattati come errori, dipendenze React/MUI/Phaser/Playwright, servizi PostgreSQL/Redis, presenza dei comandi CI essenziali e assenza di file `.env` reali o directory `secrets/` tracciati da Git.

Il gate foundation viene eseguito insieme ai controlli di release metadata e governance prima della build frontend. La CI completa include inoltre build/test backend Release, integration test PostgreSQL, restore drill, runtime Docker production-like, build frontend e Playwright.

## Principi architetturali

- server authoritative per stato del mondo e movimento;
- SignalR per presenza e aggiornamenti realtime;
- generazione del mondo deterministica tramite seed;
- eventi di gioco persistenti e tracciabili, inclusi contenuti esclusivi per singolo giocatore;
- separazione tra telemetria tecnica e audit/eventi di dominio;
- UI costruita con design token, temi chiaro/scuro e stringhe localizzabili fin dalla foundation;
- contenuti narrativi canonici indipendenti dalla lingua; la localizzazione non può alterare regole o ricompense;
- LLM opzionale e sostituibile: il gameplay core deve funzionare anche quando il modello non è disponibile;
- l'LLM può proporre tool call, ma solo il backend autorizza, valida ed esegue tool allow-listed;
- nessun secret nel repository;
- ogni regola deterministica deve essere coperta da test parametrizzati ove possibile;
- asset 2D originali del progetto; i placeholder iniziali sono generati dal codice.

## Sviluppo assistito da agent/LLM

`AGENTS.md` è la guida canonica del repository per sviluppatori e coding agent. Prima di modificare il progetto bisogna leggere quella guida, cercare l'implementazione/test esistenti e usare la skill pertinente sotto `.agents/skills/`.

Per aprire una nuova chat nel progetto usare `docs/engineering/chat-handoff-prompt.md`. Il prompt è volutamente compatto e rimanda allo stato vivo della repository. Lo stato sintetico degli sviluppi è in `docs/engineering/development-ledger.md`; il dettaglio operativo resta nelle GitHub Issues.

Sono presenti entrypoint compatibili con più strumenti:

- `.github/copilot-instructions.md` per GitHub Copilot;
- `AGENTS.md` come istruzione agent-first e fonte canonica;
- `CLAUDE.md` e `GEMINI.md` come puntatori alla stessa fonte, così le regole non divergono;
- `.github/instructions/*.instructions.md` per istruzioni Copilot specifiche per path;
- `.agents/skills/*/SKILL.md` per workflow riutilizzabili.

Le skill iniziali coprono sviluppo verticale di feature, UI/design system, i18n, testing, release/versioning, integrazione LLM/tool calling e lifecycle di feature/bug. La documentazione operativa è in `docs/engineering/`.

## Issue e tracciamento sviluppi

Ogni feature, bugfix o cambiamento non banale deve avere una GitHub Issue e una riga nel development ledger quando entra in lavorazione. Sono disponibili Issue Forms separati per Feature e Bug.

Quando una issue viene chiusa deve contenere una nota finale con cosa è stato fatto, motivo della chiusura, test/CI, versione e patch note, eventuali limiti o debito residuo; per i bug anche causa radice e regression test. Le regole complete sono in `docs/engineering/issue-lifecycle.md`.

## Avvio dipendenze locali

```bash
cp docker/.env.example docker/.env
# valorizzare le password placeholder
docker compose --env-file docker/.env -f docker/compose.dev.yml up -d
```

Questo avvia PostgreSQL, Redis e Ollama. Il servizio di init scarica il modello indicato da `VUXO_LLM_MODEL`; il default iniziale è `qwen3:1.7b`, mentre `qwen3:0.6b` è disponibile come profilo ancora più leggero.

## LLM locale

L'API .NET raggiunge Ollama solo sulla rete Docker interna tramite endpoint OpenAI-compatible. In produzione Ollama non espone porte pubbliche. La configurazione low-resource limita di default modello caricato, parallelismo, context e coda. Vedi `docs/architecture/local-llm.md`.

È presente uno smoke amministrativo protetto in `/api/admin/llm/tool-smoke`: il modello propone `get_world_context`, il backend valida/autorizza il tool tramite registry allow-list, lo esegue server-side, restituisce il risultato al modello e audita l'operazione. `/health/llm` espone lo stato LLM separatamente dalla readiness core `/health`.

## Deploy self-hosted

La pipeline pubblica l'immagine API su GitHub Container Registry. Un GitHub Actions self-hosted runner installato sul server di deploy esegue `docker compose pull` e `docker compose up -d`. Il server apre connessioni verso GitHub; Cloudflare Tunnel espone l'API e non viene usato come canale di amministrazione/deploy.

Il provisioning del server è in `infra/self-hosted/` e il runtime in `docker/compose.prod.yml`. `docker/compose.gpu.yml` abilita esplicitamente l'accesso GPU a Ollama solo quando la macchina lo supporta e i benchmark mostrano un beneficio.

Il workflow production usa `https://vuxo.quest` come origin CORS predefinita e `https://api.vuxoapi.xyz` come endpoint API del build frontend. Le variabili GitHub possono sovrascrivere questi default quando serve una migrazione controllata.

## Backlog

Il backlog è gestito tramite GitHub Issues. La EPIC `#20` definisce la first playable 0.0.1; `#21` copre design system/temi/i18n, `#22` il runtime LLM locale con tool calling, `#23` handbook/skill multi-LLM e `#24` handoff/lifecycle/ledger.
