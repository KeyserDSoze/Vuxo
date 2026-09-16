# Vuxo

Vuxo è un gioco online 2D di esplorazione, collezione e combattimento strategico in un mondo procedurale persistente. La prima milestone (`0.0.1`) porta il giocatore da login e creazione del personaggio all'ingresso in un mondo condiviso, con movimento realtime server-authoritative e presenza degli altri giocatori.

## Stack iniziale

- Backend: .NET 10 / ASP.NET Core / SignalR
- Persistenza: PostgreSQL + Entity Framework Core
- Cache e realtime scale-out: Redis
- Frontend: React + TypeScript + Phaser + MUI
- UI: design system responsive, tema system/light/dark, i18n con italiano e inglese
- LLM locale: Ollama containerizzato dietro `ILanguageModelGateway`, modello configurabile e tool calling server-side
- Test backend: xUnit, con test parametrizzati dove applicabile
- Test frontend/E2E: Playwright
- Container: Docker + Docker Compose
- Observability: OpenTelemetry + stack Grafana (backlog 0.0.1)
- Frontend hosting: GitHub Pages
- Backend hosting: server self-hosted esposto tramite Cloudflare Tunnel
- CI/CD: GitHub Actions + GHCR + GitHub self-hosted runner

## Versione

Versione iniziale: **0.0.1**.

Le patch note sono versionate in `docs/patch-notes/` e ogni build espone versione, commit e data di build.

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
.github/workflows/
```

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

## Avvio dipendenze locali

```bash
cp docker/.env.example docker/.env
# valorizzare le password placeholder
docker compose --env-file docker/.env -f docker/compose.dev.yml up -d
```

Questo avvia PostgreSQL, Redis e Ollama. Il servizio di init scarica il modello indicato da `VUXO_LLM_MODEL`; il default iniziale è `qwen3:1.7b`, mentre `qwen3:0.6b` è disponibile come profilo ancora più leggero.

## LLM locale

L'API .NET raggiunge Ollama solo sulla rete Docker interna tramite endpoint OpenAI-compatible. In produzione Ollama non espone porte pubbliche. La configurazione low-resource limita di default modello caricato, parallelismo, context e coda. Vedi `docs/architecture/local-llm.md`.

È presente uno smoke amministrativo protetto in `/api/admin/llm/tool-smoke`: verifica che il modello riesca a produrre una tool call strutturata. L'esecuzione generale dei tool sarà implementata con registry server-side allow-listed e audit completo.

## Deploy self-hosted

La pipeline pubblica l'immagine API su GitHub Container Registry. Un GitHub Actions self-hosted runner installato sul server di deploy esegue `docker compose pull` e `docker compose up -d`. Il server apre connessioni verso GitHub; Cloudflare Tunnel espone l'API e non viene usato come canale di amministrazione/deploy.

Il provisioning del server è in `infra/self-hosted/` e il runtime in `docker/compose.prod.yml`. `docker/compose.gpu.yml` abilita esplicitamente l'accesso GPU a Ollama solo quando la macchina lo supporta e i benchmark mostrano un beneficio.

## Backlog

Il backlog è gestito tramite GitHub Issues. La EPIC `#20` definisce la first playable 0.0.1; `#21` copre design system/temi/i18n e `#22` il runtime LLM locale con tool calling.
