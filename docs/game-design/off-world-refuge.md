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

### Primo riposo reale (slice #78)

Il riposo è una mutazione di HP persistiti, non ancora una cura completa.
- POST autenticata /api/characters/me/rest: il client fornisce solo Idempotency-Key UUID. Il server ricava il proprietario dal JWT e determina quantità, tempo e autorizzazione.
- Regola character-rest-v1: massimo recuperato per riposo = min(HP mancanti, arrotonda-per-eccesso(maxHP di base / 4)). Non utilizzabile a HP pieni/zero. Cooldown 30 minuti misurato sul server.
- Una transazione PostgreSQL acquisisce lock FOR UPDATE sulla riga del personaggio; verifica prima l'eventuale replay, poi il cooldown, registra i nuovi HP, una ricevuta persistente unica e un evento game_events di visibilità Player con before/after, versione regole, richiesta e timestamp.
- Se HP, ricevuta o audit falliscono, la transazione si annulla. Un timeout può essere riprovato con la stessa chiave senza doppia guarigione.
- Non esiste ancora un combattimento persistente nel world host da usare come vincolo; non possiamo quindi impedire un futuro riposo durante il combattimento. Servono in #72: blocco fuori-combattimento autorevole, danni, consumabili, notifiche cross-client e applicazione dei bonus equipaggiamento ai soli massimi realmente previsti.

La tranche #75 aggiunge CurrentHealth persistito (creazione/backfill al massimo di base = Costituzione × 10), vincolo PostgreSQL e GET owner-only, solo lettura, per mostrare la salute reale nel Rifugio. Prima di offrire cura o riposo:

- verificare la foundation #75 con test e migrazioni sui personaggi storici, mantenendo coerenza fra mondo e Rifugio;
- imporre 0 ≤ CurrentHealth ≤ MaxHealth e ricalcolare i massimi quando l'equipaggiamento modifica gli attributi;
- definire costi/riposo/cooldown e stato di gioco coerente tra mondo e Rifugio;
- consumare eventuali oggetti e curare atomicamente, con idempotenza, controllo ownership e transazione;
- audit del cambiamento con player, causa, seed/regola/versione, before/after e correlation ID;
- notificare lo stato aggiornato al client: non affidarsi a una barra HP in localStorage.

### Consumabili: scelta del Seme del Bosco (#81)

- item.grove_seed.v1 è una ricompensa portale già supportata. Può restare equipaggiata come amuleto oppure essere consumata, se non equipaggiata, per ripristinare fino a 10 HP senza superare MaxHealth base. Non ripristina da 0 HP.
- POST /api/characters/me/heal/{grantId} autenticata richiede Idempotency-Key UUID e non riceve HP o quantità dal client.
- I grant di player_inventory_awards restano storici/immutabili; character_item_heals aggiunge un registro append-only di consumi con GrantId univoco, chiave replay per personaggio, prima/dopo, timestamp e causazione verso il premio originale.
- Per HP e consumi si usa lo stesso lock FOR UPDATE del personaggio previsto dal riposo. Lock sul grant e trigger DB di esclusione reciproca equip/consume impediscono due usi o equipaggiamento di item già spesi, anche fra due API concorrenti.
- Il server registra insieme stato HP, ricevuta di utilizzo ed evento character.item_healed player-only. Le pile inventario filtrano i grant già consumati, senza eliminare la storia della ricompensa.
- Completare #72 con danni canonici, blocco in combattimento attivo e sincronizzazione realtime HP. I bonus di equipaggiamento restano un'anteprima, non HP canonici.

### Danno server dalla sfida portale (#83)

- La **prima risposta errata**, ma formata correttamente, a una sequenza di rune del proprio portale attivo può infliggere fino a 2 HP (mai sotto zero). La penalità è fissata dal server e non può essere scelta dal browser. Ripetere la risposta errata sullo stesso grant non infligge altri danni.
- I portali già consumati, scaduti, non propri o di tipo differente non infliggono danni. Risposte malformate non infliggono penalità; il grant resta risolvibile normalmente e conserva la propria ricompensa.
- L'applicazione verifica per prima cosa la sequenza canonica. Il repository del danno verifica nuovamente owner, scadenza, stato di consumo e tipo grant dentro PostgreSQL. La transazione blocca il personaggio (condivide il lock di riposo #78 e consumabili #81) e il grant, registra un solo danno per grant in `portal_mistake_damages` con constraint univoco e evento `portal.sequence_mistake_damage` player-only. Stato HP e audit vengono committati insieme.
- Su 422 `portal_challenge_incorrect` l'API restituisce `damage`, `currentHealth`, `maxHealth`, `damageApplied`; se il personaggio non esiste nessuna salute viene esposta o creata. Il client mostra un feedback di danno, non calcola autonomamente HP.
- Non è ancora un sistema di combattimento: incontri con creature, stato combattimento persistente e blocco cure/riposo, notifiche realtime e revive restano in #72. Il gioco delle rune offre una prima conseguenza persistente e rende utile la cura, anche fuori dal mondo.

### Incontri di portale persistenti: blocco cure (#85)

Un player che entra in un portale dal mondo apre un **incontro autorevole temporaneo**. L'ingresso è consentito solo dopo che il server verifica JWT, grant proprio/valido, presenza nel mondo e distanza dal marker tramite WorldSimulation; il client non invia coordinate affidabili né stato di combattimento.

- Tabella portal_encounter_states: una sola riga per personaggio, FK character e (PortalGrantId, PlayerId) verso il grant del proprietario, StartedAtUtc, ExpiresAtUtc, StartEventId, constraint temporale. PostgreSQL conserva il record anche se il server o SignalR si riavviano.
- Durata massima di 3 minuti (portal-encounter-v1); il completamento della sfida che consuma il grant disattiva immediatamente il blocco anche prima della scadenza. L'ingresso ripetuto nello stesso portale è idempotente; un ingresso su portale diverso mentre uno è attivo è rifiutato. Dopo scadenza è consentito iniziare un nuovo incontro.
- Il server acquisisce il lock FOR UPDATE sulla riga personaggio, seguito dal grant. L'evento portal.encounter_started player-only e il lease vengono salvati atomicamente, con correlazione e causazione verso il grant; nessun endpoint HTTP permette al giocatore di iniziare o terminare incontri da solo.
- Rest e cura con Seme del Bosco hanno un controllo sul lease dopo aver acquisito lo stesso lock personaggio, prima di aggiornare HP o consumare oggetti; i replay già committati mantengono la loro semantica idempotente. Rispondono con 409 rest_encounter_active / heal_encounter_active. GET /api/characters/me/encounter è owner-only e serve solo per spiegare lo stato nelle UI Rifugio/Inventario, non per autorizzare la cura. Un hook React condiviso permette di aggiornare manualmente lo stato dal server con il pulsante Aggiorna stato incontro / Refresh encounter status, evitando pulsanti bloccati dopo la fine dell'incontro.
- Non chiamare questo meccanismo combattimento con creature: è un blocco durante il portale visitato dal mondo. La sfida portale aperta direttamente dal Rifugio resta utilizzabile senza un incontro di world. Per estendere la regola a PvE/PvP occorrono scontri reali, validazione server di inizio/fine, danni, stati, turni e sincronizzazione multi-client (#72).

### Primo duello PvE a carte: Guardiano del portale (#87)

Il primo combattimento PvE è un **duello facoltativo nel portale già raggiunto dal mondo Phaser**. L'ingresso è autorizzato dal server (JWT, grant proprio, presenza nel world e prossimità). Il browser non può creare un incontro, scegliere l'avversario, inventare danni, HP, tempi o premi.

- **Showdown simultaneo:** il giocatore sceglie Attacco/Strike oppure Parata/Guard. Il Guardiano sceglie una carta in modo deterministico dal seed privato del portale e dal turno; la carta avversaria viene rivelata nella risposta. Forza modifica il danno fisico, Destrezza rompe la priorità per un colpo letale, Parata attiva una risposta difensiva/contrattacco. Regola versionata portal-guardian-showdown-v1; vita Guardiano 6..8; massimo 12 turni. Il danno non porta il giocatore sotto 1 HP fino all'introduzione di revive. Esiti ongoing/victory/retreat.
- **Stato persistito:** portal_encounter_states conserva HP del Guardiano, turno ed esito. Ogni azione registra portal_guardian_turns append-only con owner, grant, StartEventId, idempotency key, carte e HP prima/dopo; audit player-only portal.guardian_turn_resolved con causa l'evento di ingresso. L'azione usa il lock FOR UPDATE del personaggio condiviso da riposo e healing, ricontrolla il grant sotto lock e i vincoli unique bloccano turni concorrenti e replay duplicati.
- **API e fiducia:** GET owner-only /api/characters/me/portal-guardian/{grantId}; POST /api/characters/me/portal-guardian/{grantId}/turn accetta solo action/expectedTurn e header Idempotency-Key UUID. Il server rifiuta gli accessi prima del world entry, dei non proprietari, dopo scadenza/consumo e dopo l'esito finale. Un retry con stessa chiave restituisce l'esito originale, non un secondo turno.
- **Ricompense:** nessun item, XP o valuta aggiunti dal PvE. Il premio originale rimane ottenibile soltanto con il completamento della challenge di rune, non dalla vittoria sul Guardiano. Le sfide avviate direttamente fuori dal mondo non aprono il PvE.
- **Prossime evoluzioni #72:** creature e mosse modulari, statistiche canoniche fino a otto, stamina/energia, carte configurabili, combo, PvP e matchmaking, notifiche HP SignalR, revive a 0 HP. Questo incremento definisce soltanto due carte e un primo avversario deterministico.

### Evoluzione Guardiano v2: nuova carta Finta (#94)

Dopo il primo scontro PvE #87 e lo storico turni #90, i nuovi incontri entrati dal mondo usano `portal-guardian-showdown-v2`. I due colpi originali **Attacco/Parata** restano invariati. Una terza carta, **Finta**, contrasta la Parata (2 danni, +1 quando la Destrezza raggiunge la velocità del Guardiano); contro l'Attacco fa 0 danni e subisce 1 HP. Il giocatore sceglie prima di conoscere la carta avversaria. HP, seed e versione restano server-authoritative; limite 12 turni, 1 HP minimo, nessun premio nuovo, idempotenza e audit invariati. Migrazione EF additiva `202611050007` fissa a **v1** i vecchi encounter per proteggere la riproducibilità del combattimento storico; ogni nuovo ingresso genera un v2. Il client MUI IT/EN/mobile mostra Finta soltanto se l'API owner-only restituisce v2; il POST a un incontro v1 la rifiuta anche se forgiato. Non modifica Rifugio né allenamento libero.

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

### Prima foundation server delle attività (#73) — catalogo versionato senza ricompense

`GET /api/activities/catalog` è un endpoint pubblico e read-only che descrive le tre attività già individuate: `rune-memory` (memoria), `rune-reflex` (riflessi) e `rune-path` (logica). Ogni definizione include ID stabile, versione regole, tipologia, modalità `local-practice`, numero round e `rewardsEnabled=false`. La modalità `availability` è `available` per memoria e `planned` per riflessi/percorso finché le PR #95/#98 non saranno integrate. Il catalogo è versionato `offworld-activities-v1`; il contenuto non dipende dalla lingua.

`GET /api/activities/rune-path/puzzles/{puzzleIndex}` espone la geometria canonica e la versione `rune-path-practice-v1` di tre percorsi 4×4 riproducibili: ostacoli, partenza e arrivo. Il validatore nel dominio C# verifica il percorso U/D/L/R, vieta muri/uscite dal tabellone, limita a 32 mosse ed esige che si termini esattamente sul portale. La copia di prova del frontend è destinata a convergere sul catalogo prima della modalità verificata.

**Limite esplicito di sicurezza:** validare un percorso non prova che un essere umano lo abbia completato né autorizza premi; un bot può calcolare una sequenza di mosse corretta. Gli endpoint sono soltanto consultivi, non generano run, ticket, item, HP, XP, classifiche né audit di gameplay. Un client non può convertire il risultato in ricompensa. La prossima slice deve introdurre sessioni server persistite owner-only con scadenza, prova valida per quella run, deduplicazione/idempotenza, controlli di abuso e ricevute atomiche con audit; solo dopo si valuteranno premi a disponibilità limitata non basati su tempi o score autodichiarati.

### Sessioni off-world persistenti — prima tranche della #100

Il backend introduce **solo per `rune-path`** un flusso JWT owner-only:
`POST /api/activities/runs/rune-path` con header `Idempotency-Key` UUID avvia una sessione, `GET /api/activities/runs/{runId}` legge lo stato, `POST /api/activities/runs/{runId}/complete` richiede la chiave UUID e soltanto `{ "moves": "DDDRRR" }` come intenzione. Non sono accettati puzzle, seed, versione regole, punteggio, tempo o ricompense scelti dal browser. Il ticket memorizza la mappa assegnata dal server e la versione `rune-path-practice-v1`; il validator controlla le mosse **contro la mappa persistita**, non una selezionata dal client.

Le run hanno TTL di 5 minuti misurato con `TimeProvider` lato server, cooldown fra avvii di 2 minuti, massimo 12 avvii per finestra mobile di 24 ore e rate limit HTTP per utente. Ogni mutazione acquisisce `SELECT ... FOR UPDATE` sul personaggio, condividendo il protocollo di lock con cure e combattimento; ciò impedisce due run attive concorrenti su più istanze API. La tabella `offworld_activity_runs` conserva chiavi idempotenti, scope proprietario, `StartedAtUtc`, `ExpiresAtUtc`, esito, hash SHA-256 della prova di completamento, ricevute eventi e versioni regole. Avvio/completamento/scadenza sono auditati player-only in `game_events` entro la **stessa transazione** delle modifiche. Un retry identico conserva la risposta e non moltiplica gli eventi; una chiave di completamento riusata con proof diversa è rifiutata. Le run scadute rimangono consultabili in sola lettura e il loro stato viene materializzato quando si tenta di completarle o si avvia una nuova sessione.

**Limiti dell'incremento:** nessun oggetto, esperienza, HP o premio di partecipazione deriva da queste ricevute; l'abilità umana non è verificabile dalla sola sequenza. La UI mobile IT/EN, la sincronizzazione del puzzle locale con la mappa autorevole e il sistema di ricompense equilibrate restano follow-up. Le run hanno stati persistiti `active/completed/expired`; non si pubblica ancora uno stato `created` separato. La #100 resta aperta per completare il ciclo server/UI e test end-to-end di gioco.


## Secondo allenamento libero — Riflessi delle rune (#93)

La route `/#/refuge/reflex` offre otto round rapidi in cui il giocatore individua una fra quattro rune. Il bersaglio cambia dopo ogni scelta corretta e non si ripete immediatamente; un tap errato aumenta il contatore errori, senza consumare oggetti né bloccare la partita. Alla fine vengono mostrati centri, errori e tempo di reazione medio **solo locale**. L'attività è usabile da ospite su desktop/mobile via tastiera o touch, localizzata IT/EN e caricata in bundle React separato, senza importare Phaser.

Il tempo di reazione è misurato nel browser e **non è una prova verificabile dal server**. Il risultato non viene inviato, salvato, classificato o tradotto in XP, valuta, cura o ricompense. La futura versione competitiva/a premi richiede invece ticket server, regole, anti-replay e validazione autonoma, come pianificato in #73. I test Playwright coprono completamento, errori, nuova partita, refresh senza persistenza, traduzioni/viewport e nessuna richiesta di mutazione al backend.

## Terzo allenamento libero — Percorso delle rune (#97)

La route `/#/refuge/path` offre una sfida di orientamento/logica su una **griglia 4×4** con tre mappe fisse. Si parte da (0,0) e si raggiunge il portale nell'angolo opposto evitando pareti: movimenti ortogonali, nessun teletrasporto o diagonale. Le mappe sono controllate e ripetibili per permettere test deterministici; la difficoltà può evolvere in futuro con generazione seed-based ma senza delegare autorità al client.

L'interfaccia React/MUI è utilizzabile da ospite, con tastiera (frecce sul tabellone), pulsanti direzionali touch o click sulle caselle adiacenti e raggiungibili, feedback ARIA, temi chiaro/scuro e copy IT/EN. I tentativi verso muri e bordi incrementano un contatore di ostacoli senza avanzare; la conclusione mostra mosse/errori, consente il prossimo percorso e infine un nuovo ciclo. Non apre Phaser, non memorizza risultati e non chiama API gameplay.

Il punteggio/numero di mosse appartiene soltanto alla sessione locale del browser: **nessun premio, inventario, salute, esperienza, valuta, ranking o risultato persistente**. Un'eventuale versione con ricompensa dovrà passare dal motore server-authoritative #73, con catalogo, validazione e receipt atomici. Test Playwright risolvono realmente tutte e tre le mappe e verificano muri, limiti, input tastiera/touch e localizzazione/mobile.

## Modalità registrata del Percorso delle rune (#100) — UI dipendente dalle PR #98 e #101

La route React `/#/refuge/path` mantiene l'allenamento libero senza login e senza backend. Dopo il login il giocatore può scegliere **Sessione registrata**. Questa modalità chiama `POST /api/activities/runs/rune-path` con UUID `Idempotency-Key` e token autenticato, poi legge `GET /api/activities/rune-path/puzzles/{index}` in base alla **mappa assegnata nel ticket**; non sceglie un puzzle, premi o score in autonomia. La UI rifiuta geometrie/versioni discordanti rispetto al ticket.

Il tabellone mostra muri, controlli touch/frecce e tempo residuo derivato dalla scadenza UTC server. Solo dopo aver raggiunto il portale l'utente conferma le mosse con `POST /api/activities/runs/{runId}/complete` e un secondo UUID idempotente. L'interfaccia non interpreta il successo locale come prova di completamento: mostra il risultato confermato dalla risposta API. Se il server rifiuta la prova, il giocatore può azzerare il percorso e riprovare prima della scadenza. L'avviso esplicita **zero ricompense/XP/HP/oggetti**.

Per permettere un refresh nello stesso browser si conserva in `sessionStorage`, con chiave separata per account, **soltanto l'ID del ticket e la sequenza di mosse UI**. Al riavvio il browser deve leggere `GET /api/activities/runs/{runId}` con JWT e ricostruire posizione solo se la sequenza è valida sulla mappa canonica; completamento/scadenza dal server prevalgono sempre sullo stato locale. La sequenza non è una ricevuta autorevole e non costituisce una prova di abilità umana. Il server applica TTL di cinque minuti, cooldown di due minuti, limite giornaliero e controllo proprietario. Le richieste ritentate a seguito di un errore 5xx conservano la stessa chiave di idempotenza finché la pagina resta aperta.

**Dipendenze di integrazione:** la presente UI è preparata su una PR stacked a #98 (Percorso 2D); le API reali sono sulla PR #101 stacked a #99. I browser test front-end mockano il trasporto e verificano recupero/IT-EN/mobile/errori, mentre la #101 già esegue il round-trip E2E contro PostgreSQL reale. Dopo il merge coordinato serve la CI del **commit combinato**: non dichiarare funzionante in produzione una UI se i due branch non sono ancora integrati. Una sessione avviata su un altro dispositivo, senza ID locale, al momento produce l'avviso di ticket attivo e richiede il browser originale o la scadenza; una futura API di discovery owner-only potrà risolvere questo limite. Nessun merge/deploy Raspberry finché la sottotensione #59 non è risolta o il gate di deploy non è sicuro.


**QA integrazione (#100):** PR #103 su branch isolato `integration/refuge-run-ui-api-100` combina catalogo/DB/runs #99/#101 e UI #95/#98/#102 senza mutare `main`. Su questo codice combinato la CI #42132935224 ha passato 464 xUnit, 100 test Playwright e Docker; il live #42132935141 ha passato **5/5 test React/API/PostgreSQL**, verificando login, board assegnato, mosse, refresh del ticket, completamento persistito e ospiti senza API. **Nessun reward è abilitato**. Rimangono da affrontare la pubblicazione coordinata e un eventuale recupero cross-device owner-only; il deploy Raspberry è bloccato dalla sottotensione #59.

## Recupero di una sessione da un altro dispositivo (#100)

`GET /api/activities/runs/active/rune-path` è una **lettura JWT owner-only**: restituisce il singolo ticket attivo del proprietario (`200`) oppure `204 No Content` se non esistono run attive. Il repository controlla nel database `PlayerId`, `ActivityKey=rune-path`, `State=active` e `ExpiresAtUtc > now`. Il risultato è il normale ticket senza secret, reward, XP o dati di altri giocatori. L'endpoint adotta il rate limiting del motore attività e non scrive stato, non riattiva run e non produce eventi/audit in fase di ricerca. Nessuna migrazione aggiuntiva è necessaria.

Quando si apre la modalità registrata, React prova prima la run identificata nell'`sessionStorage` dell'account corrente; se non esiste o il server risponde `activity_run_not_found`, cerca il ticket attivo sul server. Questo permette la ripresa su un altro browser/dispositivo autenticato con **lo stesso account** senza copiare l'ID manualmente. La geometria viene scaricata nuovamente con `rulesVersion` e `puzzleIndex` dal server e rivalidata. `sessionStorage` resta per-device, conserva esclusivamente ID ticket e mosse visuali; **le mosse non si sincronizzano**. Sul nuovo browser il percorso ricomincia dalla prima casella mentre TTL, proprietà e completamento sono condivisi. Un eventuale completamento remoto viene rilevato al successivo recupero/refresh. Non sono esposti ticket scaduti, completati, di attività diverse o di altri utenti. L'avvio continua a rispettare idempotenza, limite giornaliero e cooldown.

Copertura verificata sul commit funzionale della PR #104: PostgreSQL/xUnit su due DbContext per owner isolation, TTL, fine run e zero audit; API 401/204/200/owner; Playwright a due browser simulati; E2E reale con due browser Chromium, API .NET e PostgreSQL. **CI #42143009030 verde: 466 xUnit, 101 Playwright, Docker**. **Live #42143008947 verde: 6/6**, compresa scoperta senza seconda POST e completamento unico. Le ricompense restano disabilitate: percorso geometrico corretto non prova attività umana.

## Aggiornamento automatico dello stato di una sessione tra dispositivi (#100)

Una volta che il browser ha caricato un ticket `active`, React controlla lo stato con `GET /api/activities/runs/{runId}` ogni **15 secondi solo mentre la scheda è visibile**. Quando la scheda torna in primo piano, effettua subito una lettura aggiuntiva. La frequenza base (~4 GET/minuto per scheda visibile) resta sotto il limite HTTP preesistente di 20 richieste/minuto per giocatore nel caso ordinario di due dispositivi; più schede concorrenti possono comunque attivare il rate limit (429), gestito come problema temporaneo. Se una richiesta fallisce o riceve 429/5xx, le successive vengono distanziate progressivamente fino a **60 secondi**: il risultato locale non viene cancellato e il client non ritenta alcuna POST, non cambia chiavi idempotenti, non attribuisce XP/premi e non avvia nuove run.

Se il server risponde `completed` o `expired`, il tabellone viene chiuso, le mosse locali di sola visualizzazione azzerate e il ticket conservato per poter mostrare la ricevuta; compare un messaggio IT/EN che segnala lo stato remoto. Un 404 rimuove il ticket non più accessibile, mentre 401/403 impediscono di continuare a mostrare la mappa riservata. Le richieste di stato sono abortite quando il componente viene smontato, cambia account, inizia una mutazione locale o la scheda diventa nascosta; non possono sovrascrivere la conclusione di una POST già in corso. Non sono stati aggiunti endpoint, migrazioni o eventi SignalR; la soluzione non richiede nuove connessioni permanenti, né polling quando il gioco non è aperto.

Test Playwright simulati verificano il completamento remoto senza refresh, scadenza autorevole, continuità delle mosse durante disconnessione temporanea, recupero alla riconnessione e assenza di nuove POST. Il live E2E ora verifica che **il primo browser veda automaticamente** il completamento effettuato dal secondo attraverso l'API e PostgreSQL reali, senza ricaricare la pagina. La sincronizzazione riguarda solo il **ticket e il suo stato**, non gli spostamenti né il tempo di reazione: un percorso risolvibile rimane automatizzabile e **non genera ricompense**.

## Cronologia privata delle sessioni Rune Path (#106)

La modalità registrata presenta ora **Le mie sessioni**: ultime 10 run create dal server, incluse quelle attive, completate e scadute, con mappa, data UTC visualizzata nel fuso locale e numero di mosse verificate **solo** per i completamenti confermati. Le sessioni sono consultabili anche su un secondo dispositivo autenticato con lo stesso account. È disponibile un pulsante per aggiornare manualmente la cronologia; viene inoltre aggiornata dopo avvio e completamento (anche da un altro dispositivo, quando rilevato dal polling precedente).

`GET /api/activities/runs/history/rune-path?limit=10` è una lettura JWT owner-only, limitata a 1–20 risultati (default 10), ordinata per data di avvio decrescente e ID per stabilizzare i pareggi. Il risultato è `{items:[...]}` senza informazioni private sull'account, hash SHA-256 della prova, chiavi idempotenti, eventi o claims sui premi. Filtra rigorosamente per `PlayerId` e `ActivityKey`, proietta lo stato effettivo delle scadenze rispetto all'orologio server senza modificare le righe PostgreSQL o produrre audit. Un ospite riceve 401 e parametri `limit` fuori intervallo 400 con codice stabile. Non fornisce statistiche globali, classifiche, XP o ricompense; la prova matematica può essere automatizzata.

Test verificati sul codice della PR #107: regressioni xUnit su PostgreSQL reale (ordinamento, limite, owner isolation, expiry non materializzata e nessun evento per le letture), contratto API e proprietà, Playwright IT/EN mobile, errori/refresh e switch account, E2E con UI reale e PostgreSQL per verificare la stessa ricevuta appena confermata. **CI #42187390310 verde: 468 xUnit, 105 Playwright e Docker; live #42187390221 verde: 6/6 test.** Nessuna migrazione nuova e nessun deploy finché la verifica Pi3 #59 non è conclusa.
