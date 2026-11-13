# Avvio locale cross-platform (issue #45, incremento 4)

Versione: **0.0.2**. Il CLI usa Node.js 24+, Docker con Compose plugin e .NET 10 SDK; funziona senza shell Bash su Windows, Linux e macOS. La prima tranche gestisce PostgreSQL/Redis e la configurazione privata; la seconda introduce **`up` con .NET API + Vite live/hot reload in container**. I comandi `debug` e `test` sono ora implementati anche per Windows senza Bash; i test di esecuzione su Windows/Linux reali e l'observability opzionale restano da completare e la #45 resta aperta.

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

`up` combina `docker/compose.dev.yml` con **`docker/compose.dev-app.yml`** per avviare anche .NET SDK 10 + `dotnet watch` (API locale con mock login **solo in Development**) e Node 24 + Vite HMR. I container frontend montano **solo** `src/frontend`, non il file di segreti. API e frontend Docker sono eseguiti con l'UID/GID numerica dell'utente host su Linux/macOS (UID non-root predefinita su Windows Docker Desktop). Un init container root inizializza **solo i volumi cache NuGet e npm** senza modificare proprietà del repository o volumi PostgreSQL/Redis; npm Docker usa `--package-lock=false` così non crea lockfile nella cartella montata. L'obiettivo è passare da `up` a `debug` senza file creati come root. Poiché Docker potrebbe creare il mountpoint interno `src/frontend/node_modules` come root anche quando i container sono non-root, il CLI lo prepara **prima** di `up`, `debug` o `test` usando i permessi dell'utente host e rifiuta directory non scrivibili senza modificarne la proprietà o cancellarne il contenuto. Backend, frontend, PostgreSQL e Redis condividono la rete Compose; le porte pubblicate sono **solo loopback**. L'app è su `http://127.0.0.1:5173/Vuxo/` (o sulla porta `VUXO_FRONTEND_DEV_PORT`), l'API su `http://127.0.0.1:8080/health` (o `VUXO_API_DEV_PORT`). Se cambi la porta Vite, aggiorna anche `VUXO_ALLOWED_ORIGIN` allo stesso origin. `up --ollama` avvia il modello e abilita il gateway LLM dell'API **solo per quella esecuzione** senza modificare `.env.local`; `up` da solo non lo avvia. `docker compose config --quiet` è verificato prima del lancio. **`up` non dichiara il mondo pronto solo perché i container sono partiti:** attende HTTP 200 da `127.0.0.1:8080/health` e dalla pagina Vite, sulle porte configurate, poi stampa gli URL locali; su errore o timeout il comando termina con exit code non-zero e si possono consultare `logs api|frontend`. Questo è un ambiente **locale**, non va esposto su rete esterna.

`logs` accetta un servizio tra `postgres`, `redis`, `api`, `frontend`, `ollama`, `ollama-model-init` (ultime 100 righe) oppure nessun argomento. `down` ferma solo lo stack `vuxo-dev` e **non** elimina i volumi di PostgreSQL/Redis/Ollama. Questi comandi non usano Compose production, Cloudflare o runner di deploy.

## Osservabilità locale opzionale

`node scripts/dev.mjs up --observability` o `node scripts/dev.mjs debug --observability` avviano un **collector OpenTelemetry locale leggero** (profilo Compose `observability`) e configurano **solo l'API Development** per inviare OTLP gRPC a un endpoint locale; nessun exporter verso Tempo, Loki, Grafana o l'esterno. Il collector scrive esclusivamente statistiche base nella diagnostica locale dopo la redazione degli attributi sensibili. Il collector è disattivato senza flag e non ha alcun ruolo nella production o nei normali test. Si può combinare liberamente con `--ollama`, senza modificare `docker/.env.local`.

Le porte opzionali nel file privato sono `VUXO_OTEL_DEV_PORT=54317` (OTLP) e `VUXO_OTEL_HEALTH_DEV_PORT=53133` (health HTTP); quelle precedenti alla nuova versione del template funzionano con gli stessi default. Sono pubblicate **solo su 127.0.0.1** e verificate dal CLI prima di dichiarare il collector pronto. `node scripts/dev.mjs logs otel-collector` mostra la diagnostica; `down` rimuove i container ma non i dati persistenti. Un gate CI Linux esegue `up --observability` e anche **`debug --observability` sull'host** (dopo shutdown dei container applicativi), verificando in entrambi i casi HTTP health, CORS e metadata amministrativi dell'exporter tramite login mock Development. Lo smoke host arresta i gruppi di processi dotnet/Vite e preserva i volumi. Le prove reali Windows Docker Desktop e IDE restano necessarie.

## Controllo sicurezza del daemon Docker

Tutti i comandi Docker del CLI locale, incluso `down`, verificano il daemon **effettivamente selezionato** prima di eseguire Compose: socket Unix su Linux/macOS, named pipe locali su Windows e TCP su `localhost`/`127.0.0.1`/`::1` sono accettati; Docker context con endpoint remoti (SSH/TCP esterno) e `DOCKER_HOST` remoti sono rifiutati con errore statico, senza stampare URL riservati. **Perché:** `127.0.0.1` nelle porte Compose punterebbe all'host remoto, non alla macchina dello sviluppatore. Usare Docker Desktop/Engine locale e rieseguire `node scripts/dev.mjs doctor`. Questo controllo non cambia il context dell'utente né arresta servizi remoti.

## Debug API/Vite sull'host

`node scripts/dev.mjs debug` avvia PostgreSQL/Redis in Docker e **attende lo stato healthy**, installa i moduli npm, poi esegue `dotnet watch` e `npm run dev` sull'host. È possibile agganciare il debugger IDE al processo .NET, con hot reload senza container applicativi. Entrambi i processi sono terminati da Ctrl+C; se uno termina inaspettatamente, il CLI arresta anche l'altro e restituisce errore. Il backend usa solo `127.0.0.1`, JWT locale, login mock **solo Development**, CORS identica all'origine Vite, PostgreSQL/Redis locali e Observability disattivata. I processi npm/Vite/Playwright **non ricevono** password o chiavi JWT: il filtro è case-insensitive (compatibile con le variabili Windows) e rimuove anche variabili OTEL/OTLP ereditate, che altrimenti potrebbero inviare la telemetria verso collector di produzione. il CLI filtra le variabili ambiente server/production ereditate e passa i segreti esplicitamente solo all'API o ai test xUnit. Il nuovo test hosted di `debug` ha rilevato un `npm install` fallito dopo il precedente `up` Docker root: i nuovi mount/app container con UID host evitano nuovi file root-owned. Per file generati da *vecchie esecuzioni locali*, controllare i soli artefatti interessati prima di correggere eventuali permessi; non eseguire un `chown -R` indiscriminato sull'intero repository. `debug --ollama` avvia opzionalmente il servizio e abilita il gateway LLM per quella sessione senza modificare il file `.env.local`; altrimenti rimane disabilitato.

`node scripts/dev.mjs test` attende PostgreSQL/Redis healthy, lancia `dotnet test Vuxo.sln -c Release` con `VUXO_TEST_POSTGRES_CONNECTION_STRING` per eseguire **davvero** anche gli integration test PostgreSQL (database di test temporanei creati/chiusi dal test harness), poi installa npm/Chromium e lancia `npm run test:e2e` (Playwright con fixture E2E locale). `test` non forza più `Observability__Enabled=false` nell'ambiente dei test xUnit: deve preservare il default del progetto e permettere la verifica reale dell'endpoint amministrativo osservabilità. Il runtime locale `debug` continua invece a disabilitare il collector opzionale. Ogni comando propaga l'exit code; non viene ignorato un test fallito. I volumi locali non vengono cancellati. Per Chromium servono le dipendenze di sistema Playwright supportate dal sistema operativo.

## Verifica runtime CI Linux e bootstrap Windows

La CI ora contiene due gate distinti sulla #45: il job **DevEx Linux live Docker stack** esegue realmente `node scripts/dev.mjs init` e `up` su Ubuntu 24.04 con Docker Engine, attende `/health` ASP.NET e il frontend Vite, e verifica `/api/auth/providers` con origine CORS locale e markup HTML. `down` è eseguito sempre senza `-v`; nessuna password viene stampata e il job non usa il tunnel/production. Il job **DevEx Windows Node and private init** esegue i contratti Node su Windows e prova `init`, presenza di `.env.local`, rispetto di `.gitignore`, rifiuto della sovrascrittura e `help` sul vero runner Windows.

Il nuovo smoke Linux ha confermato l'avvio host `.NET watch` + Vite e HTTP/CORS reali, ma la prima implementazione rimaneva bloccata **dopo il PASS** per i processi discendenti che conservavano le pipe stdout/stderr. Il CLI e lo smoke ora gestiscono process group isolati su POSIX, taskkill tree su Windows, SIGINT/SIGTERM, escalation SIGKILL temporizzata e chiusura delle pipe ereditate. Nuovi test Node avviano realmente un figlio che ignora SIGINT e verificano lo shutdown entro un limite. Il job Linux ora ferma lo stack Docker dopo lo smoke di `up`, avvia **realmente** `node scripts/dev.mjs debug` sull'host con .NET 10 SDK, Node 24 e PostgreSQL/Redis Docker, verifica HTTP 200/CORS/HTML e termina i processi via Ctrl+C. Poi esegue anche `node scripts/dev.mjs test` completo: xUnit con PostgreSQL reale e Playwright Chromium, non un test statico del solo piano di comandi. Il job Windows esegue npm/Vite **nativamente** via `npm.cmd` sul runner Windows e richiede la pagina HTML locale; prova perciò anche il lancio reale di una parte del workflow host.

Queste verifiche **non provano** la configurazione Docker Desktop del computer dell'utente, l'attach concreto di un debugger IDE o un'esecuzione `debug/test` completa su Windows con PostgreSQL locale: questi ultimi criteri restano aperti nella #45. Lo smoke Linux `debug` di [CI #43054853640](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43054853640) ha raggiunto il limite di 10 minuti nonostante i gate Docker `up` e Windows Vite verdi. La correzione usa una deadline reale di 7 minuti che comprende anche i timeout HTTP (non più un numero fisso di tentativi) e indica **solo** endpoint locali non pronti e fase statica `npm`/watch, senza rendere visibile stdout/stderr, JWT o password. La terminazione dei processi host figli è gestita separatamente tramite gruppi POSIX e stop bounded. Il motivo preciso del mancato readiness è ancora da provare. Restano quindi necessari smoke manuali Windows/Linux e verifica IDE/observability prima di chiudere la #45.

## Test del CLI

```text
node --test scripts/dev.test.mjs
```

La CI esegue i test di generazione dei segreti, parsing/validazione, restrizioni origine e porte, comandi Compose, isolamento environment e conservazione volumi; valida anche la sintassi dell'overlay Docker completo usando segreti effimeri. La verifica manuale Windows (Docker Desktop Linux containers, attach debugger IDE, `debug/test` end-to-end) e quella sull'hardware target resta nella #45, insieme a eventuale observability locale e ottimizzazioni DevEx. I test offline non equivalgono a prove sul sistema operativo dell'utente. Non dichiarare il workflow DevEx completo da questa tranche.
