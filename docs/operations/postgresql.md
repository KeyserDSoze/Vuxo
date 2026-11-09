# PostgreSQL: migration, backup e restore

Vuxo 0.0.1 usa PostgreSQL tramite EF Core/Npgsql. Il database è stato progettato perché un'istanza vuota possa arrivare allo schema corrente applicando in ordine le migration versionate.

## Migration

In production l'API usa `Database:ApplyMigrationsOnStartup=true`: all'avvio `Database.MigrateAsync()` applica soltanto le migration mancanti.

Le migration devono restare append-only. Una migration già pubblicata non va riscritta per cambiare lo schema storico: aggiungere una nuova migration con metadata EF espliciti e relativo regression/integration test.

La CI avvia un vero container PostgreSQL 17 e, per ogni integration test di persistence, crea un database temporaneo completamente vuoto. Il test applica `MigrateAsync()` e verifica che tutte le migration note risultino applicate e che le tabelle applicative correnti esistano.

## Credenziali

Password e connection string production non devono essere committate.

- `docker/.env.example` contiene esclusivamente placeholder;
- production riceve `VUXO_POSTGRES_PASSWORD` tramite secret di deployment;
- `appsettings.json` mantiene vuota `ConnectionStrings:GameDb`;
- i test CI usano un container PostgreSQL isolato con autenticazione `trust` sul solo runner effimero, quindi non richiedono una password versionata.

## Backup canonico

Usare backup logici PostgreSQL in formato custom (`pg_dump --format=custom`). Questo formato permette verifica e restore selettivo tramite `pg_restore`.

Esempio sul server production, scrivendo il backup fuori dal container:

```bash
mkdir -p "$HOME/vuxo-backups"
chmod 700 "$HOME/vuxo-backups"

docker compose \
  --env-file /percorso/vuxo.env \
  -f docker/compose.prod.yml \
  exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$HOME/vuxo-backups/vuxo-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Il file deve essere copiato su storage separato dal server applicativo e protetto secondo la sensibilità dei dati. Non considerare riuscito un backup soltanto perché `pg_dump` è terminato: eseguire periodicamente un restore drill.

Creare sempre un backup verificato prima di:

- upgrade major di PostgreSQL;
- migration distruttive o trasformazioni dati non reversibili;
- interventi manuali sullo schema o sui dati production.

## Gate automatico di backup del Raspberry (#149)

`infra/pi3/deploy.sh` non considera più sufficiente un file non vuoto. Prima di sostituire il container API esegue `pg_restore --list` in sola lettura sul **file host appena prodotto**, passando il flusso al PostgreSQL già in esecuzione con `docker compose exec -T`. Se l'archivio è illeggibile, il deploy si arresta prima di pull, restart e migration. Il controllo legge il catalogo dell'archivio, non ripristina le tabelle né valida ogni riga.

Dopo la lettura del catalogo, lo script scrive un checksum SHA-256 `vuxo-....dump.sha256` accanto al dump e lo ricontrolla in modo silenzioso. Backup e checksum sono file privati (permessi 0600) nella directory backup (0700). Per trasferire la copia su storage off-device, portare **insieme** `.dump` e `.dump.sha256`, poi verificare i nomi relativi dalla directory di destinazione:

```bash
cd /percorso/backup-off-device
sha256sum --check --status ./NOME_DEL_BACKUP.dump.sha256
```

Un checksum coerente dimostra soltanto che i byte coincidono con il manifest generato: non attesta sicurezza del dispositivo, completezza logica del database o riuscita di un restore. Periodicamente eseguire il drill descritto sotto, fuori dal database production. La #59 mantiene aperte queste prove, oltre a reboot e rollback.

## Restore drill non distruttivo

Il modo preferito per verificare un backup è ripristinarlo in un database temporaneo, senza toccare quello production.

Dentro il container PostgreSQL:

```bash
# Creazione DB di verifica
docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml \
  exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" vuxo_restore_check'

# Copia del dump nel container
docker cp "$HOME/vuxo-backups/VUXO_BACKUP.dump" \
  "$(docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml ps -q postgres):/tmp/vuxo.dump"

# Restore
docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml \
  exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d vuxo_restore_check --no-owner --no-acl --exit-on-error /tmp/vuxo.dump'
```

Dopo il restore verificare almeno:

- presenza di `__EFMigrationsHistory` e migration attese;
- conteggio/consistenza delle tabelle principali;
- possibilità di leggere personaggi ed eventi;
- eventuali controlli funzionali specifici della release.

Terminata la verifica:

```bash
docker compose --env-file /percorso/vuxo.env -f docker/compose.prod.yml \
  exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists vuxo_restore_check'
```

## Restore production

Un restore production è un'operazione esplicita e coordinata:

1. bloccare le scritture / fermare l'API;
2. acquisire un ultimo backup dell'istanza corrente quando possibile;
3. validare il file da ripristinare con un restore drill;
4. ripristinare in un database pulito o seguire una procedura documentata di sostituzione;
5. verificare migration, dati e smoke applicativi;
6. riavviare l'API soltanto dopo i controlli.

Non usare `docker compose down -v`: il flag `-v` elimina il named volume PostgreSQL ed è intenzionalmente distruttivo.

## Verifica automatica

La CI della 0.0.1 verifica due livelli distinti:

1. integration test Npgsql/EF Core su PostgreSQL 17 reale per migration, repository personaggio, vincolo univoco owner ed event store;
2. smoke `pg_dump` → `pg_restore` su due database reali nello stesso container, con un marker letto dopo il restore.

Per eseguire localmente gli integration test contro `compose.dev.yml`, avviare PostgreSQL e impostare:

```bash
export VUXO_TEST_POSTGRES_CONNECTION_STRING='Host=127.0.0.1;Port=5432;Database=postgres;Username=vuxo;Password=LA_PASSWORD_DEL_TUO_ENV;Pooling=false'
dotnet test tests/backend/Vuxo.Infrastructure.Tests/Vuxo.Infrastructure.Tests.csproj -c Release
```

Senza questa variabile gli integration test PostgreSQL vengono marcati skipped, mentre i test Infrastructure che non richiedono un database continuano a essere eseguiti.
