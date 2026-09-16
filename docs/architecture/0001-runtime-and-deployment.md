# ADR 0001 — Runtime self-hosted e deploy

## Decisione

- GitHub-hosted runner: build/test e push immagine API su GHCR.
- GitHub self-hosted runner dedicato: deploy sul server domestico.
- Docker Compose: stato dichiarativo dei servizi runtime.
- Cloudflare Tunnel: esposizione dell'API verso Internet, non amministrazione del server.
- PostgreSQL e Redis persistono su volumi Docker.

## Perché

Il self-hosted runner apre connessioni in uscita verso GitHub e non richiede SSH pubblico. Il server esegue solo artefatti già costruiti e identificati da commit SHA.

## Regola database

Gli aggiornamenti automatici di immagini non devono cambiare alla cieca major version di PostgreSQL. I major upgrade richiedono backup verificato e procedura esplicita (pg_upgrade o dump/restore). Le migration EF applicative sono invece versionate con il codice.
