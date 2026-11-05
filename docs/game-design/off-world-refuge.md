# VUXO fuori dal mondo — Rifugio e attività (EPIC #70)

## Problema e visione

VUXO non deve richiedere sempre l'ingresso nel mondo Phaser. Il **Rifugio** è un'esperienza React/MUI utilizzabile anche da mobile per sessioni brevi, con lo stesso account e lo stesso personaggio del mondo. Non è un gioco separato, non ha una seconda economia e non altera le regole server-authoritative.

Due cicli complementari:

1. **Mondo**: esplorazione, social/multiplayer, portali contestuali, combattimento e scoperta.
2. **Fuori mondo**: preparazione del Vuxian, inventario/equipaggiamento, riposo/cura, allenamento, crafting, pianificazione e minigiochi.

Il giocatore può aprire il Rifugio e agire per pochi minuti senza avviare Phaser, ma quando torna nel mondo trova gli stessi oggetti e attributi verificati dal server.

## MVP 0.0.1 — issue #71

- Route \`/#/refuge\`: accesso tramite home/menu, contenuti chiari e responsive, collegamenti agli editor/personaggio, inventario/equipaggiamento, portali personali e mondo.
- Route \`/#/refuge/training\`: allenamento di memoria delle rune con difficoltà (3, 4 o 6 rune), anteprima di 4 secondi o pulsante "Sono pronto", ripetizione tramite pulsanti, valutazione locale di correttezza e tempo.
- Nessuna ricompensa, XP, valuta, progresso, item o punteggio persistente per l'allenamento locale. Chiunque può provarlo senza backend. Test Playwright documentano il comportamento e l'assenza di chiamate alle API di gameplay.
- "Cura e riposo" sono soltanto informativi; *non c'è* un finto pulsante di cura né un contatore HP modificabile dal browser.
- Route e bundle differiti: il Rifugio non importa Phaser. Uso di MUI e i18next IT/EN.

## Evoluzione autorevole — issue #72, #73

### Cura/riposo (#72)

La tranche #75 aggiunge CurrentHealth persistito (creazione/backfill al massimo di base = Costituzione × 10), vincolo PostgreSQL e GET owner-only, solo lettura, per mostrare la salute reale nel Rifugio. Prima di offrire cura o riposo:

- verificare la foundation #75 con test e migrazioni sui personaggi storici, mantenendo coerenza fra mondo e Rifugio;
- imporre 0 ≤ CurrentHealth ≤ MaxHealth e ricalcolare i massimi quando l'equipaggiamento modifica gli attributi;
- definire costi/riposo/cooldown e stato di gioco coerente tra mondo e Rifugio;
- consumare eventuali oggetti e curare atomicamente, con idempotenza, controllo ownership e transazione;
- audit del cambiamento con player, causa, seed/regola/versione, before/after e correlation ID;
- notificare lo stato aggiornato al client: non affidarsi a una barra HP in localStorage.

### Minigiochi e progressione (#73)

Distinguiamo **pratica libera** e **attività con ricompensa**. Per la seconda non basta inviare dal browser "ho vinto" o "tempo=1s": i client sono manipolabili. Servono definizioni di prova versionate, run/ticket server, scadenze e cooldown, verifica del risultato lato server, anti-replay, ricompensa atomica e audit. Un risultato di abilità puramente visivo (es. reaction time client) non è dimostrabile in modo affidabile: può essere solo cosmetico oppure richiedere un diverso design verificabile.

Idee per attività: memoria delle rune (già disponibile come prova nei portali), laboratorio crafting, riconoscimento creature, puzzle logici, cura/riposo pianificati, gestione della base. Devono funzionare con touch e tastiera e non creare obblighi giornalieri o dipendenze dal mondo realtime.

## Contratti condivisi e limiti

- Stesso login VUXO JWT, owner-only per inventario/portali, autorizzazione API server-side.
- MUI per schermate e giochi UI. Phaser solo per mondo e interazioni spaziali.
- Le ricompense personali restano protette tramite entità grant/eventi persistiti e regole già introdotte nell'inventario (#54, #56).
- No nuovi segreti, nessuna richiesta HTTP di gameplay necessaria per la pratica offline.
- Sessioni e route non devono rivelare contenuto privato ad altri utenti o a schede con sessione scaduta.
- Nessun deploy Raspberry Pi finché l'hardware non supera i controlli di alimentazione.

## Test e release

- Playwright: home/menu→Rifugio, sessioni anonime, navigazione, mini gioco corretto/errato, livello, mobile 320/390, IT/EN/dark, assenza di richieste gameplay senza backend, regressione Phaser.
- xUnit/API/PostgreSQL quando saranno introdotti salute, risorse o ricompense reali.
- Issue/ledger e patch note IT/EN per 0.0.1.
