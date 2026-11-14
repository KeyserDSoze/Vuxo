# Docker runtime Vuxo

Questa guida descrive il runtime Docker della 0.0.1. Il principio principale è che **lo stato non vive nei container**: PostgreSQL, Redis e Ollama usano named volume, quindi un container può essere sostituito durante un deploy senza cancellare i dati.

## File canonici

- `docker/Dockerfile.api` — build multi-stage dell'API .NET 10;
- `docker/compose.dev.yml` — PostgreSQL, Redis e Ollama per sviluppo locale;
- `docker/compose.prod.yml` — runtime production-like API + PostgreSQL + Redis + Ollama e profilo Cloudflare Tunnel;
- `docker/compose.observability.yml` — overlay opzionale della #13;
- `docker/.env.example` — elenco delle variabili supportate, senza secret reali;
- `scripts/test-docker-runtime.sh` — smoke/integration test canonico del runtime.

## Sviluppo locale

Creare un file env privato partendo da `docker/.env.example` e impostare almeno `VUXO_POSTGRES_PASSWORD`.

Avviare database e cache:

```bash
docker compose --env-file /percorso/vuxo.env -f docker/compose.dev.yml up -d postgres redis
```

Per avviare anche Ollama:

```bash
docker compose --env-file /percorso/vuxo.env -f docker/compose.dev.yml up -d
```

Le porte di sviluppo sono bindate esclusivamente su `127.0.0.1` e possono essere cambiate con `VUXO_POSTGRES_DEV_PORT`, `VUXO_REDIS_DEV_PORT` e `VUXO_OLLAMA_DEV_PORT`.

## Runtime production-like

Variabili obbligatorie:

- `VUXO_API_IMAGE`;
- `VUXO_POSTGRES_PASSWORD`;
- `VUXO_JWT_SIGNING_KEY` con almeno 32 caratteri.

Avvio del runtime base:

```bash
docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml up -d
```

L'API ascolta sulla porta container `8080`; il mapping host predefinito è `127.0.0.1:64000`. Si può sovrascrivere con `VUXO_API_PORT`. Il bind su loopback evita l'esposizione diretta dell'API. PostgreSQL, Redis e Ollama **non pubblicano porte host** in production; sono raggiungibili soltanto attraverso la rete Docker `vuxo`. L'ambiente di sviluppo può continuare a usare `8080` (`VUXO_API_DEV_PORT`) e lo smoke test Docker usa una porta isolata.

L'API dipende dagli healthcheck di PostgreSQL e Redis. I tre servizi hanno `restart: unless-stopped`. L'immagine API finale deriva da `mcr.microsoft.com/dotnet/aspnet:10.0`: l'SDK .NET viene usato soltanto nello stage di build e non è presente nel runtime finale.

## Cloudflare Tunnel

Sono supportate due modalità di connector; usarne **una sola** per la route pubblicata.

### Connector cloudflared gestito dall'host

Con il servizio Windows `cloudflared.exe` installato sull'host, avviare il Compose base **senza** il profilo `edge`. L'origine locale che si configura nella published application Cloudflare è:

```text
http://127.0.0.1:64000
```

Se si cambia `VUXO_API_PORT`, aggiornare anche questa origine. Non occorre aprire la porta nel firewall: il connector la raggiunge in locale e il mapping Docker resta legato a loopback.

### Connector cloudflared in Docker

Il servizio `cloudflared` è opzionale e usa il profilo Compose `edge`:

```bash
docker compose \
  --env-file /percorso/vuxo.env \
  -f docker/compose.prod.yml \
  --profile edge \
  up -d
```

Con questa modalità, Vuxo usa un tunnel Cloudflare **remotely managed** autenticato tramite `VUXO_CLOUDFLARE_TUNNEL_TOKEN`. Nel route/published application configurato in Cloudflare, il **Service URL deve essere**:

```text
http://api:8080
```

Non usare `localhost` né `127.0.0.1`: `cloudflared` e `api` sono container differenti. Entrambi sono collegati alla stessa rete Compose e Docker DNS risolve il nome servizio `api`. In questa modalità la porta host `64000` non serve al connector; la comunicazione resta sulla porta interna `8080`.

Il profilo `edge` dipende dall'healthcheck API, quindi il connector parte dopo che l'origine è healthy. Il token resta un secret di deployment e non deve essere scritto nel repository. Non installare contemporaneamente il servizio host per lo stesso tunnel/route.

## Persistenza e recreate

Named volume production:

- `vuxo-postgres` → `/var/lib/postgresql/data`;
- `vuxo-redis` → `/data` con Redis AOF;
- `vuxo-ollama` → `/root/.ollama`.

Un normale recreate mantiene i dati:

```bash
docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml up -d --force-recreate postgres redis
```

**Non usare `docker compose down -v` in produzione** salvo quando si vuole esplicitamente cancellare i named volume. Il flag `-v` elimina lo stato.

Prima di upgrade major di PostgreSQL seguire sempre una procedura di backup/restore verificata.

## Observability opzionale

Per aggiungere lo stack della #13:

```bash
docker compose \
  --env-file /percorso/vuxo.env \
  -f docker/compose.prod.yml \
  -f docker/compose.observability.yml \
  up -d
```

Vedere `docs/operations/observability.md` per retention, Grafana e OTLP.

## Test canonico

Su una macchina con Docker + Compose:

```bash
bash scripts/test-docker-runtime.sh
```

Il test:

1. valida i modelli Compose dev/prod/edge;
2. builda l'immagine API production;
3. verifica che il runtime non contenga la directory SDK e che esponga ASP.NET Core 10;
4. avvia PostgreSQL e Redis dal Compose dev e ne verifica gli healthcheck;
5. avvia API/PostgreSQL/Redis dal Compose production-like;
6. verifica che PostgreSQL e Redis non abbiano host port e che l'API sia bindata solo a loopback;
7. verifica da un container sibling che `http://api:8080/health` sia raggiungibile, la stessa topologia usata da `cloudflared`;
8. scrive marker in PostgreSQL e Redis, ricrea entrambi i container senza cancellare i volume e verifica che i marker sopravvivano;
9. ricontrolla `/health` dell'API dopo il recreate.

La CI esegue questo script come job indipendente `docker-runtime`.
