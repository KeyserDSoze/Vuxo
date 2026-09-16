# Vuxo

Vuxo è un gioco online 2D di esplorazione, collezione e combattimento strategico in un mondo procedurale persistente. La prima milestone (`0.0.1`) ha un obiettivo semplice: autenticarsi, creare il proprio personaggio, entrare nel mondo, muoversi e vedere in tempo reale gli altri giocatori.

## Stack iniziale

- Backend: .NET 10 / ASP.NET Core / SignalR
- Persistenza: PostgreSQL + Entity Framework Core
- Cache e realtime scale-out: Redis
- Frontend: React + TypeScript + Phaser
- Test backend: xUnit
- Test frontend/E2E: Playwright
- Container: Docker + Docker Compose
- Observability: OpenTelemetry + stack Grafana
- Frontend hosting: GitHub Pages
- Backend hosting: server self-hosted esposto tramite Cloudflare Tunnel
- CI/CD: GitHub Actions + GHCR + GitHub self-hosted runner

## Versione

Versione iniziale: **0.0.1**.

Le patch note sono versionate in `docs/patch-notes/` e ogni build espone versione, commit e data di build.

## Struttura prevista

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
- separazione tra telemetria tecnica (OpenTelemetry) e audit/eventi di dominio;
- nessun secret nel repository;
- ogni regola deterministica deve essere coperta da test parametrizzati ove possibile;
- asset 2D originali del progetto; i placeholder iniziali sono generati dal codice e non dipendono da asset di terze parti.

## Deploy self-hosted

La pipeline pubblica l'immagine API su GitHub Container Registry. Un GitHub Actions self-hosted runner installato sul server di deploy esegue `docker compose pull` e `docker compose up -d`. In questo modo il server apre solo connessioni in uscita verso GitHub; Cloudflare Tunnel espone l'API e non viene usato come canale di amministrazione/deploy.

Il provisioning del server verrà descritto in `infra/self-hosted/` e il runtime in `docker/compose.prod.yml`.

## Sviluppo

I comandi completi verranno aggiunti insieme allo scaffold applicativo. Il backlog iniziale è gestito tramite GitHub Issues con prefisso `[0.0.1]`.
