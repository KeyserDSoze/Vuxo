# Avvio locale cross-platform (issue #45, incremento 1)

Versione: **0.0.1**. Il CLI usa Node.js 24+, Docker con Compose plugin e .NET 10 SDK; funziona senza shell Bash su Windows, Linux e macOS. La prima tranche gestisce le dipendenze PostgreSQL/Redis e la configurazione privata. **I comandi `up`, `debug` e `test` sono ancora da implementare** e la issue #45 resta aperta.

## Bootstrap

```text
node scripts/dev.mjs init
node scripts/dev.mjs doctor
node scripts/dev.mjs infra
node scripts/dev.mjs status
node scripts/dev.mjs logs postgres
node scripts/dev.mjs down
```

`init` genera `docker/.env.local` (ignorato da Git) con due segreti locali crittograficamente casuali e porte su `127.0.0.1`; **non sovrascrive mai** un file esistente. Il template tracciato è `docker/local.env.example`. Cambiare le porte nel file privato prima di `infra` quando altri servizi le occupano. Non copiare le password in un issue, chat o log.

`doctor` verifica chiavi, origine localhost, porte distinte, Node 24+, Docker, Compose, npm e .NET 10 senza stampare i segreti. `infra` esegue un controllo `docker compose config` e avvia **solo** `postgres` e `redis` in un progetto Docker isolato `vuxo-dev`, con porte loopback 55432 e 56379. Per avviare anche Ollama con il modello configurato:

```text
node scripts/dev.mjs infra --ollama
```

`logs` accetta un servizio tra `postgres`, `redis`, `ollama`, `ollama-model-init` (ultime 100 righe) oppure nessun argomento. `down` ferma solo lo stack `vuxo-dev` e **non** elimina i volumi di PostgreSQL/Redis/Ollama. Questi comandi non usano Compose production, Cloudflare o runner di deploy.

## Test del CLI

```text
node --test scripts/dev.test.mjs
```

La CI esegue i test di generazione dei segreti, parsing/validazione, restrizioni origine e porte, comandi Compose e conservazione volumi. Le verifiche manuali reali Windows/Linux e gli entrypoint completi Docker/API/Vite, IDE debug e test coordinati rimangono nella #45. Non dichiarare il workflow DevEx completo da questa tranche.
