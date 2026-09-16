# Setup iniziale server production Vuxo

Questa guida porta una macchina Linux appena installata allo stato **production-ready** per Vuxo.

Alla fine avrai:

- Docker Engine attivo e abilitato al boot;
- Docker Compose v2;
- GitHub Actions **self-hosted runner** registrato sulla repository privata `KeyserDSoze/Vuxo`;
- runner avviato come servizio `systemd` e pronto a ricevere il job `vuxo-prod`;
- directory persistenti per deploy, backup e stato operativo;
- secret production gestiti da GitHub Actions;
- Cloudflare Tunnel configurato per `api.vuxoapi.xyz`;
- API, PostgreSQL, Redis, Ollama e `cloudflared` avviati dal primo deploy GitHub Actions;
- riavvio automatico dello stack dopo un reboot del server;
- volumi Docker persistenti per PostgreSQL, Redis e Ollama.

> Il "programma GitHub" che collega il server alle GitHub Actions è il **GitHub Actions self-hosted runner**. Il bootstrap Vuxo lo scarica, lo registra, lo installa come servizio e lo abilita all'avvio automatico.

---

## 1. Requisiti della macchina

Il percorso production corrente richiede:

- Linux con `systemd`;
- CPU `x86_64/amd64`;
- accesso `root` o `sudo`;
- connessione Internet outbound;
- una distribuzione supportata dal bootstrap: Debian/Ubuntu/Linux Mint, RHEL/CentOS/Oracle Linux/Fedora oppure openSUSE/SLES.

Il workflow corrente usa la label GitHub `x64`; ARM64 verrà supportato solo quando anche le immagini Vuxo saranno multi-arch.

Non è necessario installare manualmente .NET, Node.js, PostgreSQL, Redis, Ollama o `cloudflared`: il runtime applicativo viene eseguito tramite container Docker.

---

## 2. Cosa serve prima di iniziare

Tieni disponibili:

1. accesso amministrativo alla repository privata GitHub `KeyserDSoze/Vuxo`;
2. accesso amministrativo al dominio/tunnel Cloudflare;
3. un metodo temporaneo per clonare la repository privata sul server;
4. il token temporaneo di registrazione del GitHub Actions runner;
5. tre secret production:
   - `VUXO_POSTGRES_PASSWORD`;
   - `VUXO_JWT_SIGNING_KEY`;
   - `VUXO_CLOUDFLARE_TUNNEL_TOKEN`.

Non salvare questi secret in file versionati, shell script o commit.

---

## 3. Installa solo gli strumenti minimi per clonare la repository

Il bootstrap installerà tutto il resto. Su una macchina completamente minimale potrebbe però mancare persino `git`.

### Debian / Ubuntu / Mint

```bash
sudo apt update
sudo apt install -y git openssh-client ca-certificates
```

### Fedora / RHEL / Rocky / Alma / Oracle Linux

```bash
sudo dnf install -y git openssh-clients ca-certificates
```

### openSUSE / SLES

```bash
sudo zypper --non-interactive install git openssh ca-certificates
```

---

## 4. Autenticati alla repository privata

Questa autenticazione serve **solo per ottenere inizialmente lo script di bootstrap**. Il runner registrato userà in seguito le credenziali temporanee dei job GitHub Actions e non richiede un PAT personale permanente sul server.

### Metodo consigliato: chiave SSH dedicata

Sul server:

```bash
ssh-keygen -t ed25519 -C "vuxo-production-bootstrap"
```

Puoi accettare il percorso predefinito. Visualizza poi la chiave pubblica:

```bash
cat ~/.ssh/id_ed25519.pub
```

Aggiungila temporaneamente al tuo account GitHub o tramite un meccanismo di accesso repository appropriato.

Verifica la connessione:

```bash
ssh -T git@github.com
```

Clona quindi la repository:

```bash
git clone git@github.com:KeyserDSoze/Vuxo.git
cd Vuxo
```

Finché la PR del bootstrap non è stata mergiata usa:

```bash
git checkout infra/universal-linux-bootstrap
```

Dopo il merge sarà sufficiente restare su `main`.

> Se preferisci HTTPS puoi usare un fine-grained PAT con il minimo accesso necessario alla repository. Non inserire il PAT direttamente nella command line e non conservarlo in file sul server.

---

## 5. Genera il token temporaneo del GitHub Actions runner

Apri GitHub e vai nella repository `KeyserDSoze/Vuxo`:

`Settings` → `Actions` → `Runners` → `New self-hosted runner`

Seleziona Linux e architettura x64.

GitHub mostrerà un token temporaneo per registrare il runner. **Copia solo il token**: non è necessario eseguire manualmente i comandi di download/configurazione mostrati da GitHub, perché li esegue il bootstrap Vuxo.

Il token di registrazione è time-limited e serve solo alla prima registrazione. Se scade, torna nella stessa pagina e generane uno nuovo.

---

## 6. Esegui il bootstrap Vuxo

Dalla root della repository:

```bash
sudo bash infra/self-hosted/bootstrap-linux.sh
```

Quando richiesto, incolla il token temporaneo del runner. L'input non viene mostrato a schermo.

Lo script installa/configura automaticamente:

- Docker Engine;
- Docker Compose v2;
- utente Linux `vuxo-runner`;
- accesso dell'utente runner al Docker daemon;
- `/opt/actions-runner`;
- `/opt/vuxo`;
- `/opt/vuxo/backups`;
- `/opt/vuxo/deploy-state`;
- ultima versione del GitHub Actions self-hosted runner;
- registrazione del runner sulla repository con label `vuxo-prod`;
- servizio `systemd` del runner;
- avvio automatico di Docker e runner dopo il reboot;
- verifiche di connettività verso GitHub e GHCR.

A fine esecuzione deve comparire:

```text
VUXO production host is ready
```

---

## 7. Verifica che GitHub veda il server

Torna su:

`Settings` → `Actions` → `Runners`

Il runner deve risultare **Idle/Online** e avere label equivalenti a:

```text
self-hosted
linux
x64
vuxo-prod
```

Il workflow Vuxo seleziona esattamente questo server con:

```yaml
runs-on: [self-hosted, linux, x64, vuxo-prod]
```

Se il runner non è online, sul server controlla:

```bash
sudo systemctl list-units --type=service | grep actions.runner
```

Il bootstrap verifica inoltre che il servizio sia `enabled` e quindi parta automaticamente dopo il reboot.

---

## 8. Configura i secret GitHub production

### Opzione consigliata: GitHub Environment `production`

Nella repository vai in:

`Settings` → `Environments`

Crea un environment chiamato esattamente:

```text
production
```

Il workflow di deploy usa questo nome.

Aggiungi come **Environment secrets**:

```text
VUXO_POSTGRES_PASSWORD
VUXO_JWT_SIGNING_KEY
VUXO_CLOUDFLARE_TUNNEL_TOKEN
```

> Su repository private la disponibilità degli Environment e degli Environment secrets dipende dal piano GitHub. Per repository private GitHub documenta il supporto con GitHub Pro, Team o Enterprise.

### Fallback per repository privata senza Environment secrets

Se il tuo piano non permette di configurare gli Environment secrets sulla repository privata, usa:

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Crea gli stessi tre secret con gli stessi nomi:

```text
VUXO_POSTGRES_PASSWORD
VUXO_JWT_SIGNING_KEY
VUXO_CLOUDFLARE_TUNNEL_TOKEN
```

Il workflow li legge tramite `secrets.<NOME>`, quindi i repository secrets con questi nomi funzionano come fallback. Mantieni comunque `environment: production` nel workflow per conservare semanticamente il target di deploy.

### Generare password/chiavi robuste

Puoi generare una password PostgreSQL casuale con:

```bash
openssl rand -base64 48
```

Per la chiave JWT usa un valore indipendente e sufficientemente lungo, ad esempio:

```bash
openssl rand -base64 64
```

Non riutilizzare la stessa stringa per PostgreSQL e JWT.

### Variabili production opzionali

Quando supportate dal piano/environment puoi aggiungere:

```text
VUXO_ALLOWED_ORIGIN=https://vuxo.quest
VUXO_PUBLIC_API_URL=https://api.vuxoapi.xyz
VUXO_LLM_MODEL=qwen3:1.7b
```

I valori sopra corrispondono già ai default production correnti.

---

## 9. Configura Cloudflare Tunnel

Vuxo usa un **remotely-managed Cloudflare Tunnel**. La configurazione del tunnel rimane su Cloudflare; sul server non installiamo un servizio `cloudflared` separato perché `cloudflared` viene eseguito come container dello stack Vuxo.

Nel dashboard Cloudflare:

1. vai in `Networking` → `Tunnels`;
2. crea un nuovo tunnel oppure seleziona quello production;
3. configura il public hostname:

```text
api.vuxoapi.xyz
```

4. configura come origin service:

```text
http://api:8080
```

`api` è il nome del container API nella rete Docker `vuxo`.

Per recuperare il tunnel token, seleziona il tunnel e usa l'opzione per aggiungere una replica/connector. Copia il token dal comando `cloudflared` mostrato da Cloudflare.

Inserisci **solo il token** nel secret GitHub:

```text
VUXO_CLOUDFLARE_TUNNEL_TOKEN
```

Non eseguire manualmente il comando `cloudflared service install ...` sul server: per Vuxo il tunnel è gestito dal container Docker.

---

## 10. Esegui il primo deploy

A questo punto il server è pronto, il runner è online e GitHub possiede i secret.

Apri:

`Actions` → `Deploy backend to self-hosted server`

Esegui `Run workflow` su `main`.

In alternativa un successivo push/merge backend su `main` attiverà automaticamente la pipeline.

Il workflow esegue:

```text
Test backend
    ↓
Build immagine Docker API
    ↓
Push su GHCR
    ↓
Job production sul self-hosted runner
    ↓
Docker Compose pull
    ↓
Docker Compose up
    ↓
API + PostgreSQL + Redis + Ollama + cloudflared
    ↓
Health check locale
    ↓
Health check pubblico via Cloudflare
```

Il deploy non richiede che tu copi manualmente file `.env`, Compose o secret sul server.

---

## 11. Verifica lo stack sul server

Dopo il primo deploy:

```bash
docker ps
```

Dovresti vedere i container production Vuxo, tra cui:

```text
api
postgres
redis
ollama
cloudflared
```

Verifica l'API locale:

```bash
curl -f http://127.0.0.1:8080/health
```

Verifica l'API pubblica:

```bash
curl -f https://api.vuxoapi.xyz/health
```

Verifica i volumi persistenti:

```bash
docker volume ls | grep vuxo
```

Devono esistere almeno:

```text
vuxo-postgres
vuxo-redis
vuxo-ollama
```

---

## 12. Test fondamentale: riavvia la macchina

Dopo il primo deploy riuscito esegui un reboot reale:

```bash
sudo reboot
```

Dopo che la macchina è tornata online, **non lanciare nessun workflow GitHub**.

Controlla:

```bash
docker ps
```

I servizi devono essere tornati online automaticamente.

Verifica di nuovo:

```bash
curl -f http://127.0.0.1:8080/health
curl -f https://api.vuxoapi.xyz/health
```

Il comportamento atteso è:

```text
boot Linux
    ↓
systemd avvia Docker
    ↓
Docker riavvia i container con restart: unless-stopped
    ↓
PostgreSQL rimonta vuxo-postgres
Redis rimonta vuxo-redis
Ollama rimonta vuxo-ollama
cloudflared ristabilisce il tunnel
API torna online
    ↓
systemd avvia anche GitHub Actions runner
```

Il reboot non richiede l'accesso a GitHub Environment: i container esistenti possiedono già la configurazione necessaria al restart. GitHub reinietta i secret quando un deploy successivo deve ricreare/aggiornare i container.

---

## 13. Verifica persistenza PostgreSQL

Il database vive nel volume Docker:

```text
vuxo-postgres
```

Un normale:

```bash
docker compose up -d
```

oppure il replacement del container PostgreSQL **non cancella il database**.

Non utilizzare in production:

```bash
docker compose down -v
```

perché `-v` richiede esplicitamente la rimozione dei volumi.

Un volume persistente non sostituisce comunque un backup. I backup PostgreSQL verranno mantenuti separatamente sotto:

```text
/opt/vuxo/backups
```

---

## 14. Dopo il setup iniziale

Per i deploy normali non devi più entrare nel server.

Il flusso diventa:

```text
merge/push main
    ↓
GitHub Actions
    ↓
test + build
    ↓
GHCR
    ↓
self-hosted runner Vuxo
    ↓
Docker Compose aggiorna lo stack
```

La macchina continua a funzionare anche se GitHub Actions non è momentaneamente disponibile: GitHub serve a distribuire nuove versioni, non a mantenere vivi i container già avviati.

La copia della repository clonata manualmente per eseguire il bootstrap iniziale può anche essere rimossa dopo il setup, perché i normali deploy usano `actions/checkout` nella directory di lavoro del runner con le credenziali temporanee del job.

---

## 15. Comandi diagnostici utili

### Docker

```bash
sudo systemctl status docker
docker ps
docker volume ls
docker network ls
```

### GitHub Actions runner

```bash
sudo systemctl list-units --type=service | grep actions.runner
sudo systemctl list-unit-files | grep actions.runner
```

### Log container

I nomi effettivi dei container possono variare. Recuperali prima con:

```bash
docker ps --format '{{.Names}}'
```

Poi usa, ad esempio:

```bash
docker logs --tail 200 <nome-container>
```

### Health check

```bash
curl -v http://127.0.0.1:8080/health
curl -v https://api.vuxoapi.xyz/health
```

---

## 16. Checklist finale

Prima di considerare il server production pronto verifica:

- [ ] macchina x64 con Linux/systemd;
- [ ] bootstrap completato senza errori;
- [ ] Docker `active` e `enabled`;
- [ ] GitHub Actions runner `Online/Idle` con label `vuxo-prod`;
- [ ] secret GitHub production configurati;
- [ ] `VUXO_POSTGRES_PASSWORD` configurato;
- [ ] `VUXO_JWT_SIGNING_KEY` configurato;
- [ ] `VUXO_CLOUDFLARE_TUNNEL_TOKEN` configurato;
- [ ] Cloudflare public hostname `api.vuxoapi.xyz` → `http://api:8080`;
- [ ] primo workflow production completato;
- [ ] API locale healthy;
- [ ] API pubblica healthy;
- [ ] volume `vuxo-postgres` presente;
- [ ] reboot reale eseguito;
- [ ] stack tornato online senza nuovo deploy;
- [ ] tunnel Cloudflare tornato online dopo il reboot;
- [ ] GitHub Actions runner tornato online dopo il reboot.

Quando tutti questi punti sono verificati, il server è pronto per ricevere i deploy automatici Vuxo.
