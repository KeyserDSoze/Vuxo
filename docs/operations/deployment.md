# Deploy

## Frontend

`deploy-pages.yml` pubblica `src/frontend/dist` su GitHub Pages. Configurare Pages con source **GitHub Actions** e la repository variable `VUXO_API_BASE_URL`.

## Backend

`deploy-server.yml`:

1. esegue test .NET su runner GitHub-hosted;
2. builda una singola immagine Docker;
3. pubblica l'immagine su GHCR con tag commit SHA;
4. passa al runner self-hosted `vuxo-prod`;
5. fa pull delle immagini dichiarate nel Compose;
6. sostituisce i container con `docker compose up -d`;
7. verifica `/health`.

## Secret production

- `VUXO_POSTGRES_PASSWORD`
- `VUXO_JWT_SIGNING_KEY`
- `VUXO_CLOUDFLARE_TUNNEL_TOKEN`

## Variable production

- `VUXO_ALLOWED_ORIGIN` — URL GitHub Pages autorizzato dal CORS.

## Backup

Prima di qualsiasi upgrade major di PostgreSQL va creato e verificato un backup. Non usare updater automatici che cambino major version del database senza procedura esplicita.
