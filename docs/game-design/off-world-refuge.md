# VUXO fuori dal mondo — Rifugio e attività (EPIC #70)

## Problema e visione

VUXO non deve richiedere sempre l'ingresso nel mondo Phaser. Il **Rifugio** è un'esperienza React/MUI utilizzabile anche da mobile per sessioni brevi, con lo stesso account e lo stesso personaggio del mondo. Non è un gioco separato, non ha una seconda economia e non altera le regole server-authoritative.

Due cicli complementari:

1. **Mondo**: esplorazione, social/multiplayer, portali contestuali, combattimento e scoperta.
2. **Fuori mondo**: preparazione del Vuxian, inventario/equipaggiamento, riposo/cura, allenamento, crafting, pianificazione e minigiochi.

Il giocatore può aprire il Rifugio e agire per pochi minuti senza avviare Phaser, ma quando torna nel mondo trova gli stessi oggetti e attributi verificati dal server.

## Gestione del loadout nell'Inventario — issue #116

La UI mostra i due slot correnti **solo quando** la lettura congiunta `GET /api/equipment` e `GET /api/inventory/stacks` è riuscita. Un caricamento incompleto o un errore non sono equivalenti a slot vuoto e non possono abilitare azioni sull'equipaggiamento.

- L'utente può vedere **Reliquia** e **Amuleto**, trovare in inventario i tipi di oggetto compatibili usando il filtro locale `slot=relic|charm` insieme a `Disponibili`, ed equipaggiare con la POST già presente dalla pila. La tabella canonica `itemKey -> slot` rimane un'allowlist; il server verifica proprietà, grant e slot.
- L'azione **Rimuovi dallo slot** è la DELETE owner-only esistente. Non sono consentite operazioni di swap automatico, mutazioni basate sullo score di UI né consumi/HP calcolati dal client.
- L'evento di mutation riesce solo quando il server lo conferma. Per mostrare il nuovo stato, UI usa la risposta `EquipmentView` canonica **e** una nuova lettura delle pile. Una GET fallita o una risposta di mutation incerta nasconde il vecchio snapshot, blocca altre azioni e propone esclusivamente il refresh delle GET senza ripetere la mutation. Il refresh manuale azzera prima i dati potenzialmente stale e rilegge anche la cronologia dei grant inventario. Dopo una cura confermata ma non sincronizzata, la UI nasconde pile, premi e slot precedenti e non ripete il consumo: recupera lo stato via sole GET.
- Un Seme del Bosco equipaggiato come amuleto va rimosso prima di richiedere la cura; i vincoli del server su lock, salute e idempotenza del consumabile non cambiano. Il pulsante esistente `HealingItemAction` usa correttamente le traduzioni `translation.inventory.*`.
- Accessibilità: pulsanti focusabili, etichette IT/EN, nessuna animazione obbligatoria, card mobile 320px e temi MUI. Cambio account mantenuto isolato tramite remount del componente implementato in #115.

Sette scenari Playwright predisposti, **non eseguiti** mentre GitHub Actions è bloccata dalla quota #112. Workstream stacked su `feature/115-inventory-browse`; merge e release solo dopo convalida.

## Inventario consultabile — issue #115

Le ricompense e le pile sono ancora e soltanto quelle lette dalle API owner-only `GET /api/inventory`, `GET /api/inventory/stacks` e `GET /api/equipment`. L'interfaccia React/MUI può filtrare e ordinare **in memoria** il materiale già caricato, senza introdurre query di ricerca al backend o alterare gli ID di grant.

- Ricerca per nome localizzato o `itemKey` canonico, case/accent insensitive, con cambio lingua senza perdere le scelte.
- Filtro Equipaggiati: grant ID effettivamente presenti in `equipment.items` e relativi `itemKey` per le pile; filtro Disponibili: grant ID in `inventory/stacks[].availableGrantIds`. Un item storico consumato non diventa nuovamente disponibile grazie a un filtro.
- Sort per nome (collator IT/EN) o quantità decrescente, deterministic fallback per ID. Risultato senza corrispondenze non equivale a inventario vuoto e può essere azzerato.
- L'area di navigazione/ricerca appare solo quando i dati necessari sono stati effettivamente caricati; se equipment/stack sono indisponibili, l'errore server resta visibile e non si mostrano filtri dalla falsa certezza.
- L'intera vista inventario è `key`ed sul token di sessione, quindi al cambio account i dati e i filtri precedenti si smontano subito e le richieste dell'utente precedente vengono abortite. Non persistiamo preferenze di ricerca, risultati o risorse del personaggio.
- Qualsiasi equip/unequip/consume continua a inviare solo intenzioni alle API esistenti, con gli stessi controlli server-side: il filtro non autorizza alcun premio o cura.

Nuovi test Playwright per anonimato, ricerca IT/EN/Unicode, filtri di grant e item consumati, ordinamento, filtro senza risultati, nessuna nuova chiamata API, viewport scuro 320px e cambio sessione. Verifica CI e merge sospesi fino al ripristino della quota Actions (#112).

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
