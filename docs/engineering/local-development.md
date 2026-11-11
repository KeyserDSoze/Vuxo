# Avvio locale cross-platform (issue #45, incremento 3)

Versione: **0.0.1**. Il CLI usa Node.js 24+, Docker con Compose plugin e .NET 10 SDK; funziona senza shell Bash su Windows, Linux e macOS. La prima tranche gestisce PostgreSQL/Redis e la configurazione privata; la seconda introduce **`up` con .NET API + Vite live/hot reload in container**. I comandi `debug` e `test` sono ora implementati anche per Windows senza Bash; i test di esecuzione su Windows/Linux reali e l'observability opzionale restano da completare e la #45 resta aperta.

## Bootstrap

```text
node scripts/dev.mjs init
node scripts/dev.mjs doctor
node scripts/dev.mjs infra
node scripts/dev.mjs up
node scripts/dev.mjs debug
node scripts/dev.mjs test
node scripts/dev.mjs status
node scripts/dev.mjs logs postgres
node scripts/dev.mjs down
```

`init` genera `docker/.env.local` (ignorato da Git) con due segreti locali crittograficamente casuali e porte su `127.0.0.1`; **non sovrascrive mai** un file esistente. Il template tracciato è `docker/local.env.example`. Cambiare le porte nel file privato prima di `infra` quando altri servizi le occupano. Non copiare le password in un issue, chat o log.

`doctor` verifica chiavi, origine localhost, porte distinte, Node 24+, Docker, Compose, npm e .NET 10 senza stampare i segreti. `infra` esegue un controllo `docker compose config` e avvia **solo** `postgres` e `redis` in un progetto Docker isolato `vuxo-dev`, con porte loopback 55432 e 56379. Per avviare anche Ollama con il modello configurato:

```text
node scripts/dev.mjs infra --ollama
```

`up` combina `docker/compose.dev.yml` con **`docker/compose.dev-app.yml`** per avviare anche .NET SDK 10 + `dotnet watch` (API locale con mock login **solo in Development**) e Node 24 + Vite HMR. I container frontend montano **solo** `src/frontend`, non il file di segreti. Backend, frontend, PostgreSQL e Redis condividono la rete Compose; le porte pubblicate sono **solo loopback**. L'app è su `http://127.0.0.1:5173/Vuxo/` (o sulla porta `VUXO_FRONTEND_DEV_PORT`), l'API su `http://127.0.0.1:8080/health` (o `VUXO_API_DEV_PORT`). Se cambi la porta Vite, aggiorna anche `VUXO_ALLOWED_ORIGIN` allo stesso origin. `up --ollama` avvia il modello e abilita il gateway LLM dell'API **solo per quella esecuzione** senza modificare `.env.local`; `up` da solo non lo avvia. `docker compose config --quiet` è verificato prima del lancio. **`up` non dichiara il mondo pronto solo perché i container sono partiti:** attende HTTP 200 da `127.0.0.1:8080/health` e dalla pagina Vite, sulle porte configurate, poi stampa gli URL locali; su errore o timeout il comando termina con exit code non-zero e si possono consultare `logs api|frontend`. Questo è un ambiente **locale**, non va esposto su rete esterna.

`logs` accetta un servizio tra `postgres`, `redis`, `api`, `frontend`, `ollama`, `ollama-model-init` (ultime 100 righe) oppure nessun argomento. `down` ferma solo lo stack `vuxo-dev` e **non** elimina i volumi di PostgreSQL/Redis/Ollama. Questi comandi non usano Compose production, Cloudflare o runner di deploy.

## Debug API/Vite sull'host

`node scripts/dev.mjs debug` avvia PostgreSQL/Redis in Docker e **attende lo stato healthy**, installa i moduli npm, poi esegue `dotnet watch` e `npm run dev` sull'host. È possibile agganciare il debugger IDE al processo .NET, con hot reload senza container applicativi. Entrambi i processi sono terminati da Ctrl+C; se uno termina inaspettatamente, il CLI arresta anche l'altro e restituisce errore. Il backend usa solo `127.0.0.1`, JWT locale, login mock **solo Development**, CORS identica all'origine Vite, PostgreSQL/Redis locali e Observability disattivata. I processi npm/Vite/Playwright **non ricevono** password o chiavi JWT: il CLI filtra le variabili ambiente server/production ereditate e passa i segreti esplicitamente solo all'API o ai test xUnit. `debug --ollama` avvia opzionalmente il servizio e abilita il gateway LLM per quella sessione senza modificare il file `.env.local`; altrimenti rimane disabilitato.

`node scripts/dev.mjs test` attende PostgreSQL/Redis healthy, lancia `dotnet test Vuxo.sln -c Release` con `VUXO_TEST_POSTGRES_CONNECTION_STRING` per eseguire **davvero** anche gli integration test PostgreSQL (database di test temporanei creati/chiusi dal test harness), poi installa npm/Chromium e lancia `npm run test:e2e` (Playwright con fixture E2E locale). Ogni comando propaga l'exit code; non viene ignorato un test fallito. I volumi locali non vengono cancellati. Per Chromium servono le dipendenze di sistema Playwright supportate dal sistema operativo.

## Test del CLI

```text
node --test scripts/dev.test.mjs
```

La CI esegue i test di generazione dei segreti, parsing/validazione, restrizioni origine e porte, comandi Compose, isolamento environment e conservazione volumi; valida anche la sintassi dell'overlay Docker completo usando segreti effimeri. La verifica manuale su Windows/Linux per Docker `up`, attach debugger `debug` e l'intera suite `test` resta nella #45, insieme a eventuale observability locale e ottimizzazioni DevEx. I test offline non equivalgono a prove sul sistema operativo dell'utente. Non dichiarare il workflow DevEx completo da questa tranche.
