# Deploy

## Frontend

`deploy-pages.yml` pubblica `src/frontend/dist` su GitHub Pages. Configurare Pages con source **GitHub Actions** e la repository variable `VUXO_API_BASE_URL`.

## Backend

`deploy-server.yml`:

1. esegue test .NET su runner GitHub-hosted;
2. builda una singola immagine Docker multi-stage;
3. pubblica l'immagine su GHCR con tag commit SHA;
4. passa al runner self-hosted `vuxo-prod`;
5. genera un env file temporaneo con permessi restrittivi partendo da secret/variable GitHub;
6. fa pull delle immagini dichiarate nel Compose;
7. sostituisce i container con `docker compose up -d` senza eliminare i named volume;
8. verifica `/health` dell'API su loopback;
9. elimina l'env file temporaneo.

Il contratto completo di rete, healthcheck, named volume, Cloudflare Tunnel e test di recreate è documentato in `docs/operations/docker-runtime.md`.

## Secret production

- `VUXO_POSTGRES_PASSWORD`
- `VUXO_JWT_SIGNING_KEY`
- `VUXO_CLOUDFLARE_TUNNEL_TOKEN`

## Variable production

- `VUXO_ALLOWED_ORIGIN` — origin frontend autorizzato dal CORS, normalmente `https://vuxo.quest`;
- `VUXO_LLM_MODEL` — modello Ollama production, se abilitato.

## Cloudflare

Il tunnel production è remotely managed. La published application per `api.vuxoapi.xyz` deve usare come Service URL `http://api:8080`, perché `cloudflared` raggiunge l'API tramite la rete Docker e non tramite `localhost`.

## Stato e backup

PostgreSQL e Redis usano named volume. Il recreate o l'aggiornamento dei container non deve usare `docker compose down -v`, perché `-v` elimina intenzionalmente lo stato.

Prima di qualsiasi upgrade major di PostgreSQL va creato e verificato un backup. Non usare updater automatici che cambino major version del database senza procedura esplicita.
