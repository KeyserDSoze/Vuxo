# Avvio locale cross-platform (issue #45, incremento 2)

Versione: **0.0.1**. Il CLI usa Node.js 24+, Docker con Compose plugin e .NET 10 SDK; funziona senza shell Bash su Windows, Linux e macOS. La prima tranche gestisce PostgreSQL/Redis e la configurazione privata; la seconda introduce **`up` con .NET API + Vite live/hot reload in container**. I comandi `debug` e `test` e la validazione fisica multi-OS restano da implementare; la #45 resta aperta.

## Bootstrap

```text
node scripts/dev.mjs init
node scripts/dev.mjs doctor
node scripts/dev.mjs infra
node scripts/dev.mjs up
node scripts/dev.mjs status
node scripts/dev.mjs logs postgres
node scripts/dev.mjs down
```

`init` genera `docker/.env.local` (ignorato da Git) con due segreti locali crittograficamente casuali e porte su `127.0.0.1`; **non sovrascrive mai** un file esistente. Il template tracciato è `docker/local.env.example`. Cambiare le porte nel file privato prima di `infra` quando altri servizi le occupano. Non copiare le password in un issue, chat o log.

`doctor` verifica chiavi, origine localhost, porte distinte, Node 24+, Docker, Compose, npm e .NET 10 senza stampare i segreti. `infra` esegue un controllo `docker compose config` e avvia **solo** `postgres` e `redis` in un progetto Docker isolato `vuxo-dev`, con porte loopback 55432 e 56379. Per avviare anche Ollama con il modello configurato:

```text
node scripts/dev.mjs infra --ollama
```

`up` combina `docker/compose.dev.yml` con **`docker/compose.dev-app.yml`** per avviare anche .NET SDK 10 + `dotnet watch` (API locale con mock login **solo in Development**) e Node 24 + Vite HMR. I container frontend montano **solo** `src/frontend`, non il file di segreti. Backend, frontend, PostgreSQL e Redis condividono la rete Compose; le porte pubblicate sono **solo loopback**. L'app è su `http://127.0.0.1:5173/Vuxo/` (o sulla porta `VUXO_FRONTEND_DEV_PORT`), l'API su `http://127.0.0.1:8080/health` (o `VUXO_API_DEV_PORT`). Se cambi la porta Vite, aggiorna anche `VUXO_ALLOWED_ORIGIN` allo stesso origin. `up --ollama` opt-in aggiunge il modello LLM; `up` da solo non lo avvia. `docker compose config --quiet` è verificato prima del lancio. Questo è un ambiente **locale**, non va esposto su rete esterna.

`logs` accetta un servizio tra `postgres`, `redis`, `api`, `frontend`, `ollama`, `ollama-model-init` (ultime 100 righe) oppure nessun argomento. `down` ferma solo lo stack `vuxo-dev` e **non** elimina i volumi di PostgreSQL/Redis/Ollama. Questi comandi non usano Compose production, Cloudflare o runner di deploy.

## Test del CLI

```text
node --test scripts/dev.test.mjs
```

La CI esegue i test di generazione dei segreti, parsing/validazione, restrizioni origine e porte, comandi Compose, isolamento environment e conservazione volumi; valida anche la sintassi dell'overlay Docker completo usando segreti effimeri. La verifica di avvio reale dei container su Windows/Linux, IDE debug e test coordinati rimangono nella #45. Non dichiarare il workflow DevEx completo da questa tranche.
