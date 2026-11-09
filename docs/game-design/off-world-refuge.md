# VUXO fuori dal mondo — Rifugio e attività (EPIC #70)

## Problema e visione

VUXO non deve richiedere sempre l'ingresso nel mondo Phaser. Il **Rifugio** è un'esperienza React/MUI utilizzabile anche da mobile per sessioni brevi, con lo stesso account e lo stesso personaggio del mondo. Non è un gioco separato, non ha una seconda economia e non altera le regole server-authoritative.

Due cicli complementari:

1. **Mondo**: esplorazione, social/multiplayer, portali contestuali, combattimento e scoperta.
2. **Fuori mondo**: preparazione del Vuxian, inventario/equipaggiamento, riposo/cura, allenamento, crafting, pianificazione e minigiochi.

Il giocatore può aprire il Rifugio e agire per pochi minuti senza avviare Phaser, ma quando torna nel mondo trova gli stessi oggetti e attributi verificati dal server.

## Preparazione avventura e percorso suggerito — issue #114 e #117

La home del Rifugio ha un **pannello di preparazione read-only** visibile soltanto quando la sessione JWT ha un personaggio e `GET /api/characters/me/health` fornisce HP validi. Senza sessione, con 404 o errore HP, il pannello non avvia letture equipment/encounter né espone dati di altri giocatori. Il caricamento della salute è indicizzato al token attivo; la vecchia risposta viene annullata e non può riapparire per il nuovo account.

Il pannello riutilizza tre read model canonici: `fetchCharacterHealth` (HP current/max, no simulazioni), `GET /api/equipment` (slot Reliquia e Amuleto letti dal server, mai supposti), `GET /api/characters/me/encounter` (incontro attivo o assente solo se provato). Gli ultimi due sono richiesti con `Promise.allSettled`; se uno fallisce si visualizza **non verificato** per quel sottoinsieme, non `slot vuoto` o `nessun incontro`. La CTA **Aggiorna preparazione** elimina il precedente snapshot di tutte e tre le sorgenti, ricarica la salute, poi rimonta il pannello per riottenere equipaggiamento e incontro. Un riposo confermato dal backend sincronizza gli HP nelle due schede con la **risposta server** della richiesta idempotente; non si calcola cura locale.

Dentro al pannello, `deriveJourneySteps` produce tre consigli **non vincolanti**: salute (0 / non piena / piena), equipaggiamento (sconosciuto / 0 / 1 / 2 slot), incontro (sconosciuto / attivo / assente). Essi suggeriscono soltanto navigazione a `/character`, `/inventory`, `/portals` o allenamento, o scroll/focus della scheda riposo; con HP=0 **non** viene suggerito riposo o consumo del Seme del Bosco, che sono vietati dal backend. Il client non calcola uno score di prontezza, non decide idoneità a combattere, non conserva progressi e non assegna oggetti/HP/XP. La UI include etichette localizzate IT/EN, tastiera e 320px senza avviare Phaser. Copertura Playwright per HP/slot/encounter, 503 parziali/recupero, refresh completo, account switch/logout, zero HP e mobilità.

## Diario del Rifugio — issue #118 (letture esistenti)

Un Diario navigabile da `/#/refuge` tramite `/#/refuge/journal` riunisce le informazioni di progressione **già disponibili** senza aggiungere un secondo stato di gioco e senza attivare Phaser. L'accesso richiede una sessione VUXO; le richieste sono sempre owner-only e il componente React si rimonta quando cambia il token.

1. **Assegnazioni di oggetti**: `fetchPlayerInventory` legge `GET /api/inventory` e restituisce i grant con itemKey, quantità, `awardedAtUtc` e eventuale `consumed`. Il diario ordina per data (recente prima) per impostazione predefinita, traduce i codici noti e offre ricerca visiva per nome localizzato o `itemKey` (senza differenze di maiuscole/accenti), filtro tutti/non consumati/consumati e ordinamento per data crescente/decrescente o nome nella lingua scelta. Un comando ripristina ricerca, filtro e ordinamento: nessuno di questi strumenti scrive dati sul server. La quantità è quella registrata nell'assegnazione; `not consumed` non significa necessariamente utilizzabile/equipaggiabile (potrebbe essere già equipaggiato, bloccato da un incontro, o soggetto a cooldown). Un grant sconosciuto si mostra come oggetto non catalogato e non viene inventato un nome.
2. **Portali disponibili adesso**: `fetchPortalGrants` legge `GET /api/personal-content` e limita ai portali con `portalKey=challenge.sequence.v1` restituiti dal backend. L'ordine segue l'eventuale scadenza (prima le più vicine, poi le non segnalate). La scheda non tenta la sfida da sola: porta a `/#/portals`. Una risposta senza grants **non** significa che non siano mai state completate sfide.
3. **Gestione rigorosa degli stati**: caricamento/errore/empty distinti per entrambi gli endpoint, retry indipendente, refresh completo che invalida immediatamente gli snapshot precedenti. AbortController e remount su cambio token evitano fughe tra account. Guest: nessuna chiamata privata e invito al login. Nessuna POST, nuova migration, XP o ricompensa da UI.

**Limite del contratto esistente:** questo NON è un registro completo delle avventure o dei portali superati. Non è possibile dedurre la provenienza di una ricompensa, né una vittoria, da una riga d'inventario. Per uno storico completo servirà il modello owner-only dell'issue **#119** per risultati di portali, con timestamp, esito, grant/correlation ID, regola e paginazione, controllato dal backend e verificato con test accesso, audit e persistenza. Solo dopo sarà possibile un timeline misto affidabile.

La suite Playwright #118 copre guest, ordinamento cronologico, portali disponibili (non altri contenuti), filtri, errori/retry parziali, refresh globale, cambio account/logout e mobile inglese/dark senza Phaser o mutazioni. Il comportamento base presente su `main` ha superato CI #42580910577 e live E2E #42580910534; la nuova ricerca e i tre ordinamenti richiedono la CI del commit dedicato. I test aggiuntivi verificano query italiane con accenti, `itemKey`, filtri combinati, sort in entrambe le lingue, reset, nessuna fetch locale aggiuntiva e reset dopo cambio account a 320px.

## Storico verificato delle rune — issue #119, prima tranche

Il Diario offre su richiesta il pulsante **Mostra portali completati** (con opzione Nascondi) che apre una terza sezione senza caricare Phaser né interrogare il server finché il giocatore non la chiede. L'endpoint `GET /api/personal-content/history/completed?page=1&pageSize=20` richiede JWT, ricava il proprietario soltanto dal subject e applica i limiti di pagina 1..1000 / dimensione 1..50. Il read model seleziona soltanto i grant rune effettivamente consumati e con prova `exclusive_content.consumed` + `challengeType=sequence` e `CausationId=GrantEventId`, controllando che audit e grant appartengano allo stesso owner: **non deduce una vittoria da un premio o da un grant consumato senza evento**. Elenco stabile per data evento+ID decrescenti, massimo 50 righe per pagina, indice DB additivo; nessuna nuova mutation o migrazione di dati storici.

La UI recupera la cronologia paginata e mostra timestamp, riferimento e versione della regola, senza seed, soluzioni o premi ipotetici. Riaprire la sezione, il refresh completo e il cambio account eliminano lo snapshot precedente e annullano le richieste in corso. Le tre letture (premi, portali disponibili, completamenti verificati) conservano errore/empty/retry distinti. IT/EN, 320px, tastiera e test API/PostgreSQL/Playwright verificano login e owner, paginazione, dati limitati, nessuna chiamata per guest o prima dell'apertura, retry, refresh e nessun Phaser. **Lo storico non comprende ancora tutti i risultati Guardian, tentativi falliti o scadenze**: sono un'evoluzione distinta di #119 e non vanno inventati.

## Cronologia degli esiti verificati — issue #119, seconda tranche

Senza alterare la prima vista **Solo rune completate**, la sezione personale dello storico introduce una modalità **Tutti gli esiti verificati**. Una GET owner-only (`/api/personal-content/history/outcomes?page=1&pageSize=20`, dimensione massima 50, pagina al massimo 1000) combina in PostgreSQL, con `UNION ALL` e ordinamento stabile `OccurredAtUtc DESC, EventId DESC`, tre tipi di prova canonica, tutti legati allo stesso proprietario e all'audit:

- `sequence_completed`: grant rune consumato con audit causale di soluzione della sequenza; **non** semplice assegnazione di oggetti.
- `sequence_first_mistake`: sola ricevuta persistita di **primo** errore della sequenza, unita all'evento di danno; non equivale al totale dei tentativi sbagliati e può riportare danno nullo.
- `guardian_victory` e `guardian_retreat`: ricevute terminali di turno del Guardiano, unite all'audit `portal.guardian_turn_resolved` tramite evento di incontro; gli scontri ancora in corso sono esclusi. La ritirata non è una sconfitta della sequenza.

La risposta contiene soltanto `eventId`, `grantId`, `contentKey`, `kind`, `ruleVersion`, `occurredAtUtc`, pagina, dimensione e `hasMore`, senza `playerId`, seed, risposte o premi. La seconda migrazione aggiunge indici owner/data agli eventi di danno e ai turni PvE; non migra o inventa vecchi risultati. Il Diario mantiene l'apertura on-demand, azzera la modalità/pagina su refresh globale o cambio proprietario, differenzia i tipi con copy IT/EN e dispone di test API, integrazione PostgreSQL e Playwright mobile/keyboard/no Phaser. I tentativi senza ricevuta e le scadenze non confermate restano fuori dallo storico.

## Provenienza causale delle ricompense — issue #119, terza tranche

I due read model del Diario, `history/completed` e `history/outcomes`, restituiscono un campo opzionale `rewardItemKey` **soltanto quando esiste una prova causale**. Il nuovo lettore PostgreSQL `PortalRewardProvenanceReader` considera esclusivamente eventi `sequence_completed` già verificati e selezionati dalla pagina corrente (max 50). Verifica `PlayerId` per evento/ricevuta, `GrantId` della sfida, `CausationId` del premio uguale all'ID evento di completamento e l'evento distinto `inventory.item_awarded` con `AwardEventId`, identico `PlayerId`, `CausationId` e `CorrelationId`. La coppia precisa evento/grant deve corrispondere all'elenco della pagina. Un indice additivo su `player_inventory_awards(PlayerId,CausationId,GrantId)` rende la verifica limitata al proprietario; nessuna migrazione retroattiva di premi o mutation.

Una ritirata o vittoria del Guardiano, il primo errore e una rune sequence senza prova di premio hanno `rewardItemKey=null`. La UI mostra il chip **Ricompensa verificata / Verified reward** esclusivamente in presenza del campo; traduce gli item catalogati e nasconde il nome dei codici futuri sconosciuti. La cronologia resta on-demand, owner-only, paginata, refresh/account-isolated e IT/EN accessibile da 320px, senza Phaser. I test PostgreSQL incrociano premio vero, premio inesistente, falso `CausationId` su grant coincidente e owner diverso; test API/Playwright verificano serializzazione, nome localizzato, modalità e reset. L'inventario e l'assegnazione server dei premi non vengono modificati.

## Paginazione keyset degli eventi verificati — issue #119, quarta tranche

Il Diario conserva le due modalità autenticata `history/completed` e `history/outcomes`, ma introduce un cursore opaco `nextCursor` quando `hasMore=true`. Alla prima richiesta si usa `page=1&pageSize=20` senza `after`. Il pulsante Carica altri invia il `nextCursor` ricevuto nel parametro opzionale `after`; PostgreSQL applica un confronto di riga `(OccurredAtUtc, EventId) < (lastTime, lastId)` **nello stesso ordine decrescente** già adottato, anche quando più eventi hanno lo stesso microsecondo. Una nuova vittoria o ricevuta più recente, comparsa fra due GET, non sposta le pagine già lette e non produce duplicati. Il cursore è codificato in base64url, versionato `v1` e limitato a 128 caratteri; token malformati, vuoti o di versione sconosciuta sono rifiutati con `portal_history_invalid_cursor` prima di leggere il database.

La forma precedente `page/pageSize` e le relative validazioni (pagina 1–1000, max 50 elementi) rimangono supportate; se il backend precedente non fornisce `nextCursor`, il frontend ricade su `page` per compatibilità durante il rollout. Il cursore **non autentica né autorizza** nulla: ogni query continua a filtrare il soggetto JWT e le ricevute causali concesse al proprietario. La paginazione è stabile rispetto a nuove inserzioni *più recenti* ma **non è uno snapshot transazionale** contro backfill retrodatati o cambiamenti dei vecchi record. Refresh, cambio modalità, cambio account e chiusura dello storico eliminano posizione e pagine precedenti. La UI mostra una nota contestuale IT/EN solo quando l'API supporta il cursore. I test reali PostgreSQL coprono ordinamenti con timestamp uguali e nuove inserzioni tra richieste, mentre API/xUnit e Playwright verificano input illeciti, navigazione IT/EN, tastiera, 320px e compatibilità legacy.

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

## Catalogo versionato delle attività off-world — issue #73, prima tranche

La API pubblica **di sola lettura** `GET /api/activities/catalog` espone il manifest `offworld-activities-v1`, con chiavi stabili, versione regole, tipo, disponibilità e numero di unità di pratica. Le attività locali già presenti nel Rifugio sono `rune-memory` (sequenza di 4 standard), `rune-reflex` (8 round) e `rune-path` (3 mappe). `crafting` è soltanto **planned**: non esiste un minigioco disponibile né un premio. Ogni voce ha `verification=local-practice`, `rewardsEnabled=false`, `progressionEnabled=false`. Questo manifest non costituisce un ticket e non concede diritti di inventario, abilità, ricompense o salute.

La seconda GET pubblica `/api/activities/rune-path/puzzles/{puzzleIndex}` (indici 0–2) restituisce un layout canonico deterministico 4×4 (partenza, obiettivo e muri), versione `rune-path-practice-v1`; indice fuori range restituisce 404 con codice stabile. Il dominio `RunePathPracticeRules.Verify(index,moves)` accetta al massimo 32 mosse ortogonali `UDLR`, respinge attraversamenti, teleport, movimenti dopo il traguardo e input/indici invalidi. Questo calcolo **attesta solo geometria**, mai un'abilità umana o un risultato premiabile: i client sono in grado di ricostruire il percorso. Non viene esposta una POST che scambia la soluzione per XP.

Nel Rifugio la sezione **Attività fuori dal mondo / Beyond-world activities** mostra su richiesta il manifest, stato disponibile/pianificato e link alle tre pratiche locali. Non invia JWT/cookie né avvia Phaser. Se il backend è offline, usa una vista di errore con retry e lascia intatte le 7 card preesistenti. Convalida versione e policy `rewardsEnabled=false` / `progressionEnabled=false`: risposte sconosciute o con claim di ricompense vengono rifiutate anziché autorizzare azioni client. Test xUnit dominio/API e Playwright IT/EN, guest, errore/retry, tastiera, mobile 320 e nessun preload Phaser. #73 **resta aperta**: ticket/run owner-only, idempotenza, TTL, cooldown, anti-abuso, prova server-verificata e premi atomici sono scope futuri #100; nessun dato nuovo viene persistito da questa tranche.

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

## Secondo allenamento libero — Riflessi delle rune (#93)

La route `/#/refuge/reflex` offre otto round rapidi in cui il giocatore individua una fra quattro rune. Il bersaglio cambia dopo ogni scelta corretta e non si ripete immediatamente; un tap errato aumenta il contatore errori, senza consumare oggetti né bloccare la partita. Alla fine vengono mostrati centri, errori e tempo di reazione medio **solo locale**. La pausa manuale o automatica quando la scheda diventa nascosta copre bersaglio e opzioni e disabilita qualsiasi avanzamento; l'utente deve premere **Riprendi** per continuare lo stesso round. Il cronometro ricomincia al nuovo frame mostrato, escludendo la pausa dalla misura e conservando centri/errori/round. L'attività è usabile da ospite su desktop/mobile via tastiera o touch, localizzata IT/EN e caricata in bundle React separato, senza importare Phaser.

Il tempo di reazione è misurato nel browser e **non è una prova verificabile dal server**. Il risultato non viene inviato, salvato, classificato o tradotto in XP, valuta, cura o ricompense. La futura versione competitiva/a premi richiede invece ticket server, regole, anti-replay e validazione autonoma, come pianificato in #73. I test Playwright coprono completamento, errori, nuova partita, refresh senza persistenza, traduzioni/viewport e nessuna richiesta di mutazione al backend. Due regressioni aggiuntive provano pausa e ripresa manuale (anche con tastiera), `visibilitychange` nascosta/visibile, bersaglio coperto, preservazione del round/errori, restart del cronometro, 320px IT/EN e assenza di API gameplay.

## Terzo allenamento libero — Percorso delle rune (#97)

La route `/#/refuge/path` offre una sfida di orientamento/logica su una **griglia 4×4** con tre mappe fisse. Si parte da (0,0) e si raggiunge il portale nell'angolo opposto evitando pareti: movimenti ortogonali, nessun teletrasporto o diagonale. Le mappe sono controllate e ripetibili per permettere test deterministici; la difficoltà può evolvere in futuro con generazione seed-based ma senza delegare autorità al client.

L'interfaccia React/MUI è utilizzabile da ospite, con tastiera (frecce sul tabellone), pulsanti direzionali touch o click sulle caselle adiacenti e raggiungibili, feedback ARIA, temi chiaro/scuro e copy IT/EN. I tentativi verso muri e bordi incrementano un contatore di ostacoli senza avanzare; **Annulla ultima mossa** torna esclusivamente alla casella precedente valida (senza cancellare gli urti), mentre **Ricomincia questo percorso** azzera mosse, urti e cronologia anche dopo aver vinto, senza avanzare di mappa. Il comando facoltativo **Mostra un indizio** calcola in memoria con BFS deterministica un cammino ortogonale minimo alla posizione attuale e comunica solo la prima direzione e il numero di passi ancora necessari; non sposta il giocatore e non altera mosse, urti o esito. L'indizio si azzera dopo ogni movimento valido, annullamento, riavvio e cambio mappa; gli urti non cambiano posizione, quindi l'indizio resta valido. La conclusione mostra mosse/errori, consente il prossimo percorso e infine un nuovo ciclo. Non apre Phaser, non memorizza risultati e non chiama API gameplay.

Il punteggio/numero di mosse appartiene soltanto alla sessione locale del browser: **nessun premio, inventario, salute, esperienza, valuta, ranking o risultato persistente**. Un'eventuale versione con ricompensa dovrà passare dal motore server-authoritative #73, con catalogo, validazione e receipt atomici. Test Playwright risolvono realmente tutte e tre le mappe e verificano muri, limiti, undo solo per passi validi, reset dopo completamento, direzione minima deterministica su tutte le mappe, nessuna mutazione da indizio, input tastiera/touch e localizzazione/mobile.
