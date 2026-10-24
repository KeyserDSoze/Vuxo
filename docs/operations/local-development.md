# Sviluppo locale VUXO — Windows e Linux

Questa guida usa **gli stessi comandi Node.js** da PowerShell, cmd e terminale Linux. Il runtime **production**, il GitHub Actions runner e Cloudflare Tunnel non sono coinvolti. I container e i volumi hanno il project name dedicato `vuxo-local`.

## 1. Prerequisiti

- Git (per clonare la repository privata), Node.js 24 e Docker Compose v2. Su Windows installa Docker Desktop con backend WSL2; su Linux Docker Engine con Compose plugin.
- **Solo per `debug`, `test` e `doctor`**: SDK .NET 10 e npm (incluso con Node). Per `up` (tutto Docker) .NET SDK e npm sull'host non sono necessari.
- Spazio per le immagini Docker. Ollama e le immagini per l'osservabilità sono **opzionali**, disabilitati di default.

Apri PowerShell (Windows) oppure un terminale Linux dalla root del checkout:

```sh
git clone git@github.com:KeyserDSoze/Vuxo.git
cd Vuxo
```

Finché la PR della feature non è mergiata su `main`, usa il branch `feature/local-cross-platform-docker-debug`.

## 2. Configurazione locale

```sh
node scripts/dev.mjs init
```

Questo comando copia `docker/local.env.example` in **`docker/.env.local`** e genera tre credenziali locali casuali indipendenti (database, JWT, Grafana). Il file è escluso da Git e **non viene mai sovrascritto automaticamente**. Non usare le credenziali locali in produzione. Modifica le porte dopo `init`:

```dotenv
VUXO_API_PORT=18080
VUXO_FRONTEND_PORT=15173
VUXO_POSTGRES_DEV_PORT=15432
VUXO_REDIS_DEV_PORT=16379
VUXO_OLLAMA_DEV_PORT=11435
VUXO_GRAFANA_PORT=13000
VUXO_E2E_PORT=14173
```

Le porte host devono essere **distinte**. Il comando `doctor` verifica le porte, la sintassi Compose e gli strumenti: `node scripts/dev.mjs doctor`. Le porte di PostgreSQL, Redis, API, Vite, Ollama e Grafana sono esposte solo su `127.0.0.1`.

## 3. Modalità Full Docker

```sh
node scripts/dev.mjs up
```

Avvia: PostgreSQL 17 con volume, Redis con persistenza AOF, API .NET 10 in ambiente `Development` (compilata/avviata tramite SDK + `dotnet watch`), frontend React/Vite con reload. Di default **non avvia Ollama**: il gioco deve funzionare senza un modello locale. I container montano il codice sorgente, quindi le modifiche frontend/backend aggiornano il runtime di sviluppo. Le porte frontend e API sono rispettivamente `VUXO_FRONTEND_PORT` e `VUXO_API_PORT`. Apri:

- Frontend: `http://localhost:5173/` (oppure la porta impostata).
- API: `http://127.0.0.1:8080/health` (oppure la porta impostata).
- OpenAPI in Development: `http://127.0.0.1:8080/openapi/v1.json`.

Per controllare stato e log:

```sh
node scripts/dev.mjs status
node scripts/dev.mjs logs
node scripts/dev.mjs smoke
```

## 4. Modalità IDE Debug (breakpoint .NET)

```sh
node scripts/dev.mjs debug
```

Parte PostgreSQL + Redis in Docker; `dotnet watch` e Vite vengono avviati **sulla macchina host**, con config locale applicata automaticamente: JWT, stringa PostgreSQL, Redis, CORS, Base URL frontend e porte. I breakpoint si impostano sul processo `Vuxo.Api` con Visual Studio, Rider o VS Code usando **Attach to .NET Process**; il frontend è debuggabile normalmente dal browser. CTRL+C interrompe i processi host, **non cancella i volumi Docker**.

Per far partire il backend **dall'IDE invece che da `dev.mjs debug`**, usa `node scripts/dev.mjs infra`, quindi imposta nel profilo di avvio dell'IDE le stesse variabili create dal workflow: `ASPNETCORE_ENVIRONMENT=Development`, `ASPNETCORE_URLS`, `ConnectionStrings__GameDb`, `Redis__ConnectionString`, `Auth__Jwt__SigningKey`, `Cors__AllowedOrigins__0` e `__1` e `Llm__BaseUrl`. Non committare file di lancio dell'IDE contenenti segreti. Con `infra` puoi anche eseguire soltanto `npm run dev` nella cartella `src/frontend`, passando `VITE_BASE_PATH=/` e `VITE_API_BASE_URL` secondo la porta scelta.

## 5. Test completi

```sh
node scripts/dev.mjs test
```

Il comando avvia PostgreSQL e Redis reali, esegue i test Node dell'orchestratore, `dotnet restore`/build/test della solution (inclusi integration test PostgreSQL abilitati tramite `VUXO_TEST_POSTGRES_CONNECTION_STRING`), build frontend e Playwright Chromium. **Playwright usa i suoi adapter E2E deterministici**: non sostituisce lo smoke end-to-end contro l'API Docker reale. `node scripts/dev.mjs smoke` testa gli endpoint HTTP dello stack avviato con `up`. Su Linux minimale potrebbero servire le librerie di sistema Chromium: `cd src/frontend && npx playwright install --with-deps chromium`.

Il test runtime production-like originale `bash scripts/test-docker-runtime.sh` resta invariato e viene eseguito nella CI Linux. Non eseguirlo sul database di sviluppo: è un test isolato che gestisce autonomamente i propri volumi temporanei.

## 6. Servizi opzionali

Per Ollama imposta nel file privato:

```dotenv
VUXO_LLM_ENABLED=true
VUXO_LLM_MODEL=qwen3:1.7b
```

`up`/`infra` avviano Ollama ed eseguono il pull del modello configurato. Il primo pull può richiedere parecchio spazio e tempo; il modello non è necessario ai test deterministici. L'API lo raggiunge solo sul proprio bridge Docker (oppure via loopback in `debug`); il browser non deve chiamarlo direttamente.

Per lo stack opzionale di osservabilità:

```dotenv
VUXO_OBSERVABILITY_ENABLED=true
```

`up` applica inoltre l'overlay `docker/compose.observability.yml`, avviando Grafana/Prometheus/Loki/Tempo/Collector. Grafana è su `http://127.0.0.1:3000` o `VUXO_GRAFANA_PORT`; usa la password casuale generata in `docker/.env.local`. Il profilo `debug` esegue **solo** le dipendenze Docker principali: per osservabilità completa usa `up`.

## 7. Arresto sicuro e isolamento

```sh
node scripts/dev.mjs down
```

**`down` non usa `-v`** e conserva i named volume Postgres/Redis/Ollama. Cambiare `VUXO_COMPOSE_PROJECT` crea un ambiente Docker indipendente, non migra i dati precedenti. Non eseguire `docker compose down -v` se vuoi mantenere le partite e i database di test. `docker/.env.local` è una configurazione locale privata, diversa da `docker/.env.example` (production).

## 8. Diagnostica

- `doctor` fallisce: controlla che Docker Desktop/Engine sia avviato, Docker Compose v2 e Node 24 disponibili; SDK .NET 10 serve per debug/test.
- Una porta è occupata: modificane il valore in `docker/.env.local` e ripeti `up`; la stessa porta non può essere condivisa da due servizi locali.
- JWT richiesto all'avvio: esegui `init` per generare `Auth__Jwt__SigningKey` di lunghezza adeguata.
- PostgreSQL credenziali modificate su volume esistente: la password iniziale è associata al volume esistente. Ripristina la vecchia password o effettua la rotazione nel database; non eliminare il volume alla cieca.
- Auth social: Microsoft e Google devono ammettere l'origine frontend locale configurata. Il mock login è abilitato soltanto in `Development`; non è una feature production.
- Windows PowerShell: **non** serve Bash/WSL shell per eseguire `dev.mjs` o il nuovo launcher Playwright. Docker Desktop può utilizzare WSL2 internamente.
- Il primo `up` può scaricare immagini e restore di dipendenze; in caso di errore diagnostica con `status`/`logs`.

### Limiti della verifica

I test Node e la validazione del modello Docker devono girare nella CI Linux/Windows. Il funzionamento operativo del full stack e il debug con breakpoint devono essere provati **su una vera postazione Windows e Linux** prima di chiudere la issue #45. Nessuno script locale installa Docker, modifica configurazioni del sistema o accede a GitHub Environment Secrets.
