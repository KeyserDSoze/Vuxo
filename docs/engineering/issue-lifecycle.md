# Issue lifecycle di Vuxo

Ogni lavoro non banale deve essere tracciato con una GitHub Issue. Le issue sono il dettaglio operativo; `docs/engineering/development-ledger.md` è l'indice sintetico dello stato.

## Apertura

### Feature
Usare il template Feature e indicare almeno:
- obiettivo e valore per il gioco/piattaforma;
- versione target e area;
- scope esplicito e fuori-scope quando utile;
- acceptance criteria verificabili;
- strategia di test;
- impatti UI/i18n, audit/telemetria, database e release.

### Bug
Usare il template Bug e indicare almeno:
- sintomo osservato;
- passi di riproduzione e ambiente/versione;
- comportamento atteso;
- severità/impatto;
- evidenze utili senza secret;
- regression test previsto;
- causa radice quando viene identificata.

Prima di iniziare, impostare/aggiornare la riga nel development ledger a `In progress`.

## Durante il lavoro

Aggiornare la issue quando:
- viene presa una decisione architetturale importante;
- cambia lo scope o un acceptance criterion;
- emerge un blocco/dipendenza;
- viene identificata la causa di un bug;
- viene completato un passaggio sostanziale o una verifica importante.

Non aggiungere rumore con un commento per ogni file o commit minimo. Il commento deve lasciare informazione utile alla prossima persona/chat.

Se il lavoro si blocca, aggiornare anche il ledger a `Blocked`, indicando la dipendenza concreta.

## Chiusura

Una issue si chiude solo dopo aver verificato acceptance criteria, test rilevanti, documentazione, ledger e patch note della release corrente quando applicabile.

Prima o contestualmente alla chiusura aggiungere un commento finale con questo schema:

```text
## Chiusura

### Cosa è stato fatto
- ...

### Perché viene chiusa
- ...

### Verifiche
- test/comando/CI: risultato
- ...

### Release
- versione: x.y.z
- patch note: docs/patch-notes/x.y.z.md
- commit/PR rilevanti: ...

### Limiti / debito residuo
- nessuno, oppure issue/link/descrizione
```

Per un bug aggiungere inoltre:

```text
### Causa radice
- ...

### Regression test
- ...
```

Se la issue viene chiusa `not planned`, `duplicate` o `cancelled`, il commento deve spiegare perché e indicare l'eventuale issue sostitutiva.

## Ledger

Dopo la chiusura aggiornare `docs/engineering/development-ledger.md` con:
- stato finale (`Done`, `Deferred`, `Duplicate`, `Cancelled`);
- test/verifica finale;
- breve risoluzione o issue successiva.

Il ledger non deve replicare tutta la cronologia: i dettagli restano nella issue.

Le righe `Done`, `Duplicate` e `Cancelled` oltre le 15 più recenti vanno spostate, **senza modificarle**, in `docs/engineering/development-ledger-archive.md`; le righe attive restano sempre nel ledger. Lo stesso vale per le voci del patch note: se ne tengono le più recenti in `docs/patch-notes/<VERSION>.md` e le precedenti in `<VERSION>-archive.md`. Dopo lo spostamento verificare che nessuna riga o sezione sia andata persa.

## Versioning

Non serve un bump per ogni issue/commit. Il bump avviene quando si apre una nuova versione/release. Tuttavia ogni modifica destinata alla versione corrente deve essere riflessa nella patch note corrente prima che la release venga considerata completa.
