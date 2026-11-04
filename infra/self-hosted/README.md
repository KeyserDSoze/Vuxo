# Server self-hosted Vuxo

> **Prima installazione?** Segui la guida completa step-by-step in [`SETUP.md`](./SETUP.md). Parte da una macchina Linux minimale e una repository privata e arriva fino al primo deploy, Cloudflare Tunnel e test di reboot/persistenza.

## Modello di deploy

1. GitHub Actions testa backend e frontend.
2. L'API viene buildata una sola volta e pubblicata su `ghcr.io/keyserdsoze/vuxo-api:<commit-sha>`.
3. Il job `deploy` gira sul runner GitHub self-hosted con label `vuxo-prod`.
4. Il runner esegue `docker compose pull` e `docker compose up -d --remove-orphans`.
5. L'API applica le migration EF all'avvio nella prima fase del progetto.
6. La pipeline verifica sia `http://127.0.0.1:8080/health` sia l'endpoint pubblico `https://api.vuxoapi.xyz/health` attraverso Cloudflare Tunnel.
7. La pipeline verifica che tutti i servizi persistenti abbiano restart policy `unless-stopped`.

## Bootstrap consigliato

Per una macchina Linux nuova usare `infra/self-hosted/bootstrap-linux.sh`. Lo script è idempotente e prepara automaticamente:

- Docker Engine con servizio Docker abilitato all'avvio del sistema;
- Docker Compose v2;
- utente dedicato `vuxo-runner` con accesso al socket Docker;
- directory `/opt/vuxo`, `/opt/vuxo/backups` e `/opt/vuxo/deploy-state`;
- ultima versione del GitHub Actions self-hosted runner;
- registrazione repository-level con label `vuxo-prod`;
- servizio `systemd` del runner esplicitamente abilitato all'avvio e avviato;
- verifica finale di Docker, Compose, runner, GitHub e GHCR;
- verifica che Docker e il runner risultino `systemctl is-enabled`;
- workaround `needrestart` sulle distribuzioni Debian-based, per evitare riavvii del runner durante i workflow.

Il bootstrap prepara l'host. I container applicativi, PostgreSQL, Redis, Ollama e Cloudflare Tunnel vengono invece creati dal primo deploy GitHub Actions, usando i secret dell'environment `production`.

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
read -r -s -p 'Runner registration token: ' VUXO_RUNNER_TOKEN; echo
sudo env VUXO_RUNNER_TOKEN="$VUXO_RUNNER_TOKEN" \
  bash infra/self-hosted/bootstrap-linux.sh --non-interactive
unset VUXO_RUNNER_TOKEN
```

Il token viene richiesto con input nascosto e non deve essere incollato come literal nella shell history; usa il token solo per la registrazione, poi cancellalo dalla sessione.

Lo script può essere rilanciato: se Docker, l'utente o il runner risultano già presenti li conserva e ne verifica lo stato invece di creare installazioni parallele.

## GitHub Environment

Prima del primo deploy creare/proteggere l'environment GitHub `production` e inserire almeno questi secret runtime:

- `VUXO_POSTGRES_PASSWORD`
- `VUXO_JWT_SIGNING_KEY`
- `VUXO_CLOUDFLARE_TUNNEL_TOKEN`

Variabili production opzionali:

- `VUXO_ALLOWED_ORIGIN`, default `https://vuxo.quest`;
- `VUXO_PUBLIC_API_URL`, default `https://api.vuxoapi.xyz`;
- `VUXO_LLM_MODEL`, default `qwen3:1.7b`.

Non salvare questi valori sulla repository o in file versionati. Il workflow crea un environment file temporaneo durante il deploy e lo elimina sempre alla fine. I secret dell'environment sono disponibili soltanto al job che referenzia `production` e dopo le eventuali protection rules configurate su GitHub.

Dopo bootstrap e configurazione dei secret non serve più entrare nel server per i normali deploy: un cambiamento backend su `main` passa da test/build, viene pubblicato su GHCR e viene applicato dal runner `vuxo-prod`.

Per il primissimo deploy, dopo aver registrato il runner e configurato environment/tunnel, eseguire manualmente il workflow `Deploy backend to self-hosted server` con `workflow_dispatch` oppure effettuare un nuovo push/merge backend su `main`. Non è necessario copiare manualmente Compose o secret sulla macchina.

## Cloudflare Tunnel

Vuxo usa un tunnel Cloudflare gestito remotamente. Non installare `cloudflared` direttamente sull'host: `docker/compose.prod.yml` contiene il servizio `cloudflared` e GitHub Actions lo avvia insieme allo stack production.

Configurazione una tantum lato Cloudflare:

1. creare/selezionare il tunnel production nel dashboard Cloudflare;
2. configurare il public hostname `api.vuxoapi.xyz`;
3. configurare come origin service `http://api:8080` perché `cloudflared` e `api` condividono la rete Docker `vuxo`;
4. copiare il tunnel token nell'environment secret GitHub `VUXO_CLOUDFLARE_TUNNEL_TOKEN`;
5. non salvare il token sulla repository o nello script di bootstrap.

Il primo deploy esegue il container `cloudflared` con quel token. La pipeline considera il deploy riuscito solo se l'API risponde localmente e successivamente anche attraverso `https://api.vuxoapi.xyz/health`.

## Comportamento dopo un riavvio del server

Il server non dipende da GitHub Actions per ripartire dopo un reboot normale.

- `systemd` avvia Docker al boot;
- Docker conserva i container creati dall'ultimo deploy;
- `api`, `postgres`, `redis`, `ollama` e `cloudflared` hanno `restart: unless-stopped` e ripartono automaticamente;
- PostgreSQL rimonta il volume host Docker `vuxo_vuxo-postgres`;
- Redis rimonta `vuxo_vuxo-redis`;
- Ollama rimonta `vuxo_vuxo-ollama`, quindi i modelli già scaricati restano disponibili;
- `ollama-model-init` è volutamente one-shot e non deve restare in esecuzione;
- il GitHub Actions runner riparte come servizio `systemd` ed è pronto per i deploy successivi.

Il progetto Docker Compose di produzione ha nome fisso `vuxo`, quindi la rete e i volumi mantengono nomi stabili indipendentemente dal checkout del runner.
**Compatibilità con i volumi esistenti:** il project name Compose è fissato a `vuxo`, mantenendo i nomi standard dei volumi derivati dal checkout originale (`vuxo_vuxo-postgres`, `vuxo_vuxo-redis`, `vuxo_vuxo-ollama`). Su un host già utilizzato, esegui `docker volume ls` prima del primo deploy: se il vecchio progetto usava un nome diverso, pianifica backup e migrazione dei volumi prima di procedere. Non eseguire mai `docker compose down -v` per provare a correggere il problema; elimina i dati.


Il file `/tmp/vuxo.env` non è necessario al reboot: serve soltanto a creare/aggiornare i container durante un deploy e viene eliminato al termine. I container già creati conservano la configurazione necessaria al proprio restart. Un successivo deploy riceverà nuovamente i secret da GitHub Environment e potrà ricreare lo stack.

Nota: `unless-stopped` rispetta uno stop manuale esplicito. Se un amministratore esegue intenzionalmente `docker stop` su un servizio, quel servizio rimane fermo finché non viene avviato nuovamente; questo evita che il sistema annulli una scelta amministrativa intenzionale.

## Sicurezza

Il runner dovrebbe vivere, se possibile, in una VM/LXC dedicata: l'accesso al socket Docker equivale di fatto a privilegi elevati sull'host. Non eseguire job provenienti da pull request non trusted sul runner production.

La macchina non deve esporre pubblicamente la porta dell'API. `docker/compose.prod.yml` pubblica l'API soltanto su `127.0.0.1:8080`; Cloudflare Tunnel è il percorso di ingress pubblico.

Lo script non modifica automaticamente firewall o SSH perché una policy generica potrebbe rendere la macchina irraggiungibile. Il deploy Vuxo richiede soltanto connettività outbound HTTPS verso GitHub/GHCR e quella necessaria a Cloudflare Tunnel.

## Alternativa Ansible

`infra/self-hosted/ansible/` resta disponibile per provisioning amministrato da un'altra macchina. Il bootstrap Bash è il percorso consigliato per portare rapidamente una singola macchina Linux minimale allo stato pronto per il deploy.
