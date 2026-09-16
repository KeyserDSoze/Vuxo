# Server self-hosted Vuxo

## Modello di deploy

1. GitHub Actions testa backend e frontend.
2. L'API viene buildata una sola volta e pubblicata su `ghcr.io/keyserdsoze/vuxo-api:<commit-sha>`.
3. Il job `deploy` gira sul runner GitHub self-hosted con label `vuxo-prod`.
4. Il runner esegue `docker compose pull` e `docker compose up -d --remove-orphans`.
5. L'API applica le migration EF all'avvio nella prima fase del progetto.
6. La pipeline verifica `http://127.0.0.1:8080/health`.
7. Cloudflare Tunnel espone il servizio pubblico.

## Prima installazione

Eseguire il playbook Ansible da una macchina amministrativa raggiungibile in LAN, quindi registrare il runner dalla pagina `Settings > Actions > Runners > New self-hosted runner` della repository. Usare un runner repository-level dedicato e aggiungere la label `vuxo-prod`.

Il runner dovrebbe vivere, se possibile, in una VM/LXC dedicata: l'accesso al socket Docker equivale di fatto a privilegi elevati sull'host.

## GitHub Environment

Creare un environment `production` e proteggere i deploy da branch non autorizzati. Inserire i secret runtime nell'environment, non in file versionati.
