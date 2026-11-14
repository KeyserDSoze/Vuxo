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

Il workflow Linux esistente usa il connector `cloudflared` in Docker: la published application per `api.vuxoapi.xyz` deve usare `http://api:8080`. Per il Compose manuale con il servizio `cloudflared.exe` installato sull'host Windows, non avviare il profilo Compose `edge`; in quel caso il mapping API predefinito è solo loopback e la published application usa `http://127.0.0.1:64000`. Non mescolare le due modalità: `api:8080` è l'indirizzo interno Docker, `127.0.0.1:64000` quello del connector sullo stesso host.

### Rate limiting dietro il tunnel

L'API è pubblicata solo su loopback e sulla rete privata, quindi l'indirizzo del peer è sempre il connettore `cloudflared`. `compose.prod.yml` imposta `Network__TrustCloudflareConnectingIp=true`: gli utenti non autenticati sono limitati per `CF-Connecting-IP` (solo se è un IP valido e presente una volta), quelli autenticati per ID giocatore. **Non abilitare l'impostazione** se l'API diventa raggiungibile senza passare dal tunnel: l'header sarebbe falsificabile.

Policy: `auth-social` 10/min, `portal-challenge` 12/min, `world-chunk` 60/min; superamento → HTTP 429.

### Limiti del mondo

Il mondo è limitato a ±256 chunk (±4096 tile) attorno all'origine (`WorldGenerationRules.MaxChunkExtent`). Fuori da questo raggio `GET /api/world/chunks/{x}/{y}` risponde `400 world_chunk_out_of_range` e il movimento server-side non considera calpestabili le tile esterne; questo limita righe persistite e cache runtime.

## Stato e backup

PostgreSQL e Redis usano named volume. Il recreate o l'aggiornamento dei container non deve usare `docker compose down -v`, perché `-v` elimina intenzionalmente lo stato.

Prima di qualsiasi upgrade major di PostgreSQL va creato e verificato un backup. Non usare updater automatici che cambino major version del database senza procedura esplicita.
