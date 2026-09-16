# Server self-hosted Vuxo

## Modello di deploy

1. GitHub Actions testa backend e frontend.
2. L'API viene buildata una sola volta e pubblicata su `ghcr.io/keyserdsoze/vuxo-api:<commit-sha>`.
3. Il job `deploy` gira sul runner GitHub self-hosted con label `vuxo-prod`.
4. Il runner esegue `docker compose pull` e `docker compose up -d --remove-orphans`.
5. L'API applica le migration EF all'avvio nella prima fase del progetto.
6. La pipeline verifica `http://127.0.0.1:8080/health`.
7. Cloudflare Tunnel espone il servizio pubblico.

## Bootstrap consigliato

Per una macchina Linux nuova usare `infra/self-hosted/bootstrap-linux.sh`. Lo script è idempotente e prepara automaticamente:

- Docker Engine e servizio Docker;
- Docker Compose v2;
- utente dedicato `vuxo-runner` con accesso al socket Docker;
- directory `/opt/vuxo`, `/opt/vuxo/backups` e `/opt/vuxo/deploy-state`;
- ultima versione del GitHub Actions self-hosted runner;
- registrazione repository-level con label `vuxo-prod`;
- servizio `systemd` del runner abilitato e avviato;
- verifica finale di Docker, Compose, runner, GitHub e GHCR;
- workaround `needrestart` sulle distribuzioni Debian-based, per evitare riavvii del runner durante i workflow.

Il workflow production corrente usa la label `x64`, quindi il bootstrap accetta host `x86_64/amd64`. Prima di supportare ARM64 bisogna rendere multi-arch anche la build dell'immagine API e il targeting del workflow.

Le famiglie Linux supportate dal bootstrap coincidono con quelle principali supportate dal GitHub Actions runner e dotate di `systemd`: Debian/Ubuntu/Linux Mint, RHEL/CentOS/Oracle Linux/Fedora e openSUSE/SLES. Alpine/musl e host senza `systemd` non vengono configurati automaticamente.

### Uso interattivo

Scaricare o clonare la repository sulla macchina e avviare:

```bash
sudo bash infra/self-hosted/bootstrap-linux.sh
```

Se il runner non è ancora registrato, lo script richiede in modo nascosto il token temporaneo ottenuto da:

`Settings > Actions > Runners > New self-hosted runner`

Il token viene usato soltanto da `config.sh` e non viene scritto dallo script in file di configurazione Vuxo.

### Uso non interattivo

Per provisioning automatizzato:

```bash
sudo VUXO_RUNNER_TOKEN='<temporary-registration-token>' \
  bash infra/self-hosted/bootstrap-linux.sh --non-interactive
```

È preferibile passare il token tramite variabile d'ambiente o input nascosto invece di `--token`, così non rimane nella shell history.

Lo script può essere rilanciato: se Docker, l'utente o il runner risultano già presenti li conserva e ne verifica lo stato invece di creare installazioni parallele.

## GitHub Environment

Prima del primo deploy creare/proteggere l'environment GitHub `production` e inserire almeno questi secret runtime:

- `VUXO_POSTGRES_PASSWORD`
- `VUXO_JWT_SIGNING_KEY`
- `VUXO_CLOUDFLARE_TUNNEL_TOKEN`

Non salvare questi valori sulla repository o in file versionati. Il workflow crea un environment file temporaneo durante il deploy e lo elimina sempre alla fine.

Dopo bootstrap e configurazione dei secret non serve più entrare nel server per i normali deploy: un cambiamento backend su `main` passa da test/build, viene pubblicato su GHCR e viene applicato dal runner `vuxo-prod`.

## Sicurezza

Il runner dovrebbe vivere, se possibile, in una VM/LXC dedicata: l'accesso al socket Docker equivale di fatto a privilegi elevati sull'host. Non eseguire job provenienti da pull request non trusted sul runner production.

La macchina non deve esporre pubblicamente la porta dell'API. `docker/compose.prod.yml` pubblica l'API soltanto su `127.0.0.1:8080`; Cloudflare Tunnel è il percorso di ingress pubblico.

Lo script non modifica automaticamente firewall o SSH perché una policy generica potrebbe rendere la macchina irraggiungibile. Il deploy Vuxo richiede soltanto connettività outbound HTTPS verso GitHub/GHCR e quella necessaria a Cloudflare Tunnel.

## Alternativa Ansible

`infra/self-hosted/ansible/` resta disponibile per provisioning amministrato da un'altra macchina. Il bootstrap Bash è il percorso consigliato per portare rapidamente una singola macchina Linux minimale allo stato pronto per il deploy.
