# VUXO fuori dal mondo — Rifugio e attività (EPIC #70)

## Rientro nell'app e verifica dello stato del portale (#120)

I dati letti dal Rifugio e dall'Inventario non sono aggiornati in tempo reale quando altri dispositivi modificano il personaggio. Per evitare di presentare HP e oggetti obsoleti al ritorno, le viste ora richiedono una nuova lettura owner-only su `focus` e `visibilitychange`. Gli eventi sovrapposti sono deduplicati; non si avvia una seconda lettura quando è già in corso un caricamento e non si interrompe una mutazione locale pendente. Per l'Inventario le GET passano anche attraverso il controllo di coerenza stock/equipaggiamento; per il Rifugio viene ricaricata la salute e quindi la scheda di preparazione con equipaggiamento e stato portale. Si tratta di sincronizzazione **al rientro**, non di push realtime, e il backend resta la fonte autorevole.

Uno stato incontro sconosciuto (errore rete, 503 o JSON invalido) non è uno stato inattivo: cure e riposo devono mostrare **avviso distinto e controllo di riprova**, senza autorizzare un POST finché non è tornato un valore valido. Il backend conserva il blocco definitivo delle mutazioni durante gli incontri, anche se lo stato letto dal browser diventa obsoleto.

Sono passati in locale 8 test Node del gate focus e il suo controllo TypeScript strict. Quattro nuove regressioni Playwright e il build completo attendono il collaudo fuori da GitHub Actions (#112).

## Coerenza delle letture fra dispositivi (#120)

Due dispositivi possono modificare lo stesso inventario mentre il browser esegue le GET `/api/inventory/stacks` e `/api/equipment` separatamente. Pur essendo ciascuna risposta valida, **la coppia può essere contraddittoria**: un oggetto risulta contemporaneamente equipaggiato e disponibile, oppure la quantità equipaggiata nello stack non corrisponde ai due slot. `inventorySnapshotConsistency.ts` verifica la coerenza prima di abilitarne l'uso; se necessario ripete **una sola volta entrambe le GET**, poi richiede aggiornamento manuale senza ripristinare dati obsoleti. Anche dopo un equip/unequip la risposta dell'azione non viene trattata come snapshot definitivo: viene effettuata una nuova lettura coerente dello stato proprietario. Dopo una cura il refresh coerente si accompagna alla lettura delle assegnazioni inventario. Il browser non diventa arbitro del combattimento né sostituisce i vincoli di integrità del database.

Le transazioni di cura/riposo continuano a serializzarsi tramite lock PostgreSQL sul personaggio; i vincoli di equipaggiamento e i trigger di esclusione fra consumo e equip restano l'ultima autorità. Sono stati predisposti due test con DbContext indipendenti per verificare questo comportamento reale, ma **non sono ancora stati eseguiti**. Gli 11 test Node locali del comparatore sono superati; i 3 Playwright sulla vista multi-dispositivo attendono Chromium.

## Sequenziamento delle azioni del giocatore (#120)

Nella medesima sessione dell'Inventario le intenzioni di cura, equipaggiamento e rimozione sono serializzate da una *lease* effimera del frontend, distinta dalla transazione PostgreSQL. La lease usa il token soltanto per verificare che il giocatore corrente sia ancora il proprietario; non è un permesso di gioco e non sostituisce il controllo JWT del backend. Il completamento asincrono dell'azione può aggiornare React **solo se** la stessa lease è ancora valida. Logout/cambio account invalida le lease e interrompe le richieste ancora aperte, senza fingere che una POST già ricevuta dal server sia stata annullata.

Dopo una cura effettivamente confermata, la UI nasconde immediatamente grant disponibili e slot, poi attende **tre letture autorevoli riuscite** dello stesso account prima di riattivare i comandi. Un errore di refresh mostra il successo già confermato della cura ma non ripristina gli oggetti precedenti: il retry è una GET, non un secondo POST. Un oggetto già consumato non resta riutilizzabile mentre il browser attende risposte lente. Test Node locali (6/6) e TypeScript strict superati sul gate; test Playwright di concorrenza e account-switch scritti ma in attesa di browser.

## Validazione delle mutazioni off-world (#120)

Le azioni del Rifugio sono intenzioni inviate al server, non aggiornamenti del personaggio calcolati nel browser. Il nuovo `ownerMutationContracts.ts` conferma la **ricevuta server** per cura, riposo ed equipaggiamento: stessa UUID idempotente, grant consumato richiesto, HP e tempi coerenti; `replayed` esplicito; equip/unequip riflessi negli slot ritornati. Un HTTP 200 incompleto o falso resta **ambiguo**: la cura/riposo mantengono la UUID originale nel pulsante Riprova, perché il server potrebbe aver già effettuato il commit. Equip/unequip invece nascondono lo snapshot non affidabile e chiedono una lettura GET autorevole. Tutti gli errori continuano a bloccare le operazioni o a offrire una ripetizione sicura, senza scalare premi/HP locali.

Sono stati eseguiti 11 test Node e il controllo TypeScript `strict` sul modulo puro; 4 nuovi browser test su risposte positive incongruenti sono pronti ma non eseguiti. La validazione completa `React + browser + .NET + PostgreSQL` rimane obbligatoria prima di qualunque merge/deploy (#112).

## Dati proprietari sicuri nelle schermate off-world (#120)

Il Rifugio e l'Inventario non deducono mai HP, slot, quantità o stato di incontro dal browser. I rispettivi endpoint proprietari (`/api/inventory`, `/api/inventory/stacks`, `/api/equipment`, `/api/characters/me/health`, `/api/characters/me/encounter`) vengono ora controllati dal modulo puro `ownerReadContracts.ts` prima che React mostri i risultati. Il parser scarta proprietà non attendibili (seed, ID proprietario non richiesto, flag di prontezza inventati) e rifiuta grant/slot duplicati, conteggi impossibili, valori HP non validi e incontri contraddittori. L'errore provoca gli stati già esistenti di avviso e ripetizione della lettura: **non** autorizza azioni e **non** muta il backend. Le risposte alle mutazioni `equip`/`unequip` sono controllate prima di aggiornare lo stato visibile. La compatibilità con record storici che non includono `consumed` rimane, senza inventare disponibilità: i grant disponibili continuano a provenire dagli stack del server.

Sono stati eseguiti localmente 12 test Node per questi modelli e gli 8 test già presenti sullo storico; entrambi i moduli passano il controllo TypeScript strict isolato. I quattro nuovi Playwright e l'intera build frontend/backend sono ancora da eseguire prima del merge (#112).

## Problema e visione

VUXO non deve richiedere sempre l'ingresso nel mondo Phaser. Il **Rifugio** è un'esperienza React/MUI utilizzabile anche da mobile per sessioni brevi, con lo stesso account e lo stesso personaggio del mondo. Non è un gioco separato, non ha una seconda economia e non altera le regole server-authoritative.

Due cicli complementari:

1. **Mondo**: esplorazione, social/multiplayer, portali contestuali, combattimento e scoperta.
2. **Fuori mondo**: preparazione del Vuxian, inventario/equipaggiamento, riposo/cura, allenamento, crafting, pianificazione e minigiochi.

Il giocatore può aprire il Rifugio e agire per pochi minuti senza avviare Phaser, ma quando torna nel mondo trova gli stessi oggetti e attributi verificati dal server.

## Provenienza verificata delle ricompense — issue #119, terza tranche

### QA di provenance rafforzata (#120)

Per qualificare una ricompensa come effettivamente proveniente dal completamento di una sequenza, il read model rilegge il grant proprietario e l'audit di consumo: `RewardKey`, `CorrelationId`, `RuleVersion`, `GrantEventId`, `ConsumedAtUtc` e i dati del record `PlayerInventoryAward` devono essere coerenti con **entrambi** gli eventi audit di consumo e assegnazione. Una ricevuta aggiunta artificialmente con lo stesso `CausationId` ma correlazione difforme o chiave oggetto diversa dal grant non è attribuibile, anche se il grant è stato realmente risolto. L'attribuzione resta un arricchimento **read-only**, non crea o toglie oggetti. Test PostgreSQL di forgery aggiunti in #120 e in attesa di esecuzione.



La ricompensa canonica `PlayerInventoryAward` conserva già `GrantId`, `PlayerId`, `AwardEventId`, `CorrelationId` e `CausationId`. La sequenza di rune, quando viene risolta correttamente, scrive nella **stessa unità di lavoro** l'evento di consumo `exclusive_content.consumed`, l'assegnazione inventario (solo per oggetti presenti nel catalogo) e l'evento audit `inventory.item_awarded`. Il nuovo `PortalRewardProvenanceReader` associa un oggetto a un risultato **solo** dopo questi controlli:

- Il risultato base è già una **sequenza completata** provata dall'evento `exclusive_content.consumed` con `data.challengeType=sequence`, proprietario corretto, grant consumato e collegamento `CausationId=GrantEventId`.
- `player_inventory_awards.PlayerId` deve coincidere con l'owner JWT; la chiave di grant dell'award deve coincidere con il grant dell'esito **della pagina corrente**; `award.CausationId` deve essere esattamente l'ID dell'evento di consumo della sequenza verificata.
- Deve esistere un **evento audit distinto** `inventory.item_awarded` con `EventId=award.AwardEventId`, proprietario identico, `CausationId=award.CausationId` e `CorrelationId=award.CorrelationId`. Una riga award isolata, una causalità sbagliata o il medesimo grant senza prova non bastano.
- Solo in quel caso i DTO di `history/completed` e di `history/outcomes` mostrano `rewardItemKey`; altrimenti `null`. Errori di rune, vittorie e ritirate del Guardiano **non** ereditano l'eventuale premio della sequenza sul medesimo grant. Non si tenta alcun collegamento inventato tra la vittoria PvE e la ricompensa.
- Il resolver legge soltanto gli EventId della pagina già limitata (max 50 righe) e verifica i grant in memoria contro quella pagina dopo la query owner-only. Aggiunto indice `IX_player_inventory_awards_PlayerId_CausationId_GrantId` (migrazione `202611060003_PortalRewardProvenanceIndex`), senza modificare storico/premi o generare backfill.
- La scheda del Diario mostra **Ricompensa verificata: [nome localizzato]** solo se il server restituisce `rewardItemKey`. Per chiavi future sconosciute, etichetta “Oggetto non ancora catalogato” senza inferire altre proprietà. Le due modalità di storico mantengono paginazione, retry, refresh e isolamento account.

QA predisposta: test HTTP sulla serializzazione dei DTO, test PostgreSQL del consumo reale con premi supportati/assenti/causazione volutamente falsata e cross-owner, quattro Playwright per premio verificato, primo errore/Guardiano senza falsa associazione, paginazione e cambio account su mobile IT/EN/dark. **Non eseguiti** finché GitHub Actions è bloccata da #112.

### Integrità aggiuntiva del registro: eventi audit e incontro (#120)

La verifica della sequenza richiede ora che `exclusive_content.consumed` corrisponda anche a `CorrelationId` e `RuleVersion` del grant; la ricevuta `portal.sequence_mistake_damage` deve rispettare `CorrelationId` del grant e versione specifica del danno. Per **Guardian**, una ricevuta di turno terminale non basta: serve l'evento immutabile `portal.encounter_started` referenziato da `EncounterEventId`, con `PlayerId`, `CorrelationId`, `RuleVersion=PortalEncounterRules.Version` e `CausationId=grant.GrantEventId`; il turno `portal.guardian_turn_resolved` conserva causa `EncounterEventId`, correlazione del grant e versione PvE riconosciuta. In assenza di questo collegamento l'esito non è elencato. I nuovi assert PostgreSQL falsificano selettivamente questi metadati dopo la creazione di eventi reali: nessuna retroattribuzione di vittorie, cambio di gameplay o migrazione.

## Esiti verificati delle avventure — issue #119, seconda tranche

La nuova consultazione `GET /api/personal-content/history/outcomes?page=1&pageSize=20` integra il registro dei completamenti già realizzato. Il read model `PortalOutcomeHistoryReader` combina tramite `UNION ALL` tre insiemi persistenti, con una pagina massima di 50 righe, limite a 1000 pagine, sort `OccurredAtUtc DESC, EventId DESC` ed evento unico per chiave:
- **`sequence_completed`**: evento `exclusive_content.consumed` (JSONB `data.challengeType=sequence`) collegato a `GrantEventId`, con grant effettivamente consumato e owner coerente. Non basta la presenza di un oggetto o una riga `ConsumedAtUtc`.
- **`sequence_first_mistake`**: riga `portal_mistake_damages` con FK evento e grant, evento audit `portal.sequence_mistake_damage` correlato al `GrantEventId` e owner identico in grant/receipt/evento. Un grant ha al più una ricevuta di primo errore; non è possibile ricostruire il numero degli altri tentativi errati o inferire una sconfitta definitiva.
- **`guardian_victory` / `guardian_retreat`**: riga di turno `portal_guardian_turns` con stato terminale canonico `victory` o `retreat`, collegata all'evento audit `portal.guardian_turn_resolved`, con `CausationId=EncounterEventId`, FK grant e owner verificati. Le righe `ongoing` non sono conclusioni; la ritirata non viene rinominata sconfitta delle rune.

La risposta include soltanto `eventId`, `grantId`, `contentKey`, `kind`, `ruleVersion` e `occurredAtUtc`. Niente seed, mosse segrete, rewardKeys, playerId, payload degli eventi o tentativi non auditati. La timeline legge `NameIdentifier` dal JWT; il browser può solo richiedere pagina e dimensione. Aggiunta migrazione indice `202611060002_PortalOutcomeHistoryIndexes` per owner/timestamp/evento sulle due tabelle ricevute.

Nel Diario #118/#119 un solo pannello presenta due modalità esplicite: **Solo rune completate** (endpoint `history/completed`, compatibile) e **Tutti gli esiti verificati** (nuovo endpoint). Il cambio modalità azzera immediatamente dati e paginazione; account switch e refresh globale rimontano i modelli, abortendo le richieste precedenti. Le traduzioni IT/EN distinguono il primo errore con danno dalla ritirata PvE. Nessun replay di tentativo o mutazione dal Diario.

Test API HTTP per autenticazione, owner, paginazione e payload ristretto; integrazione PostgreSQL con `PortalMistakeDamageRepository`, `ExclusiveContentService.SubmitChallengeAsync`, `PortalGuardianRepository.PlayAsync` per esiti terminali; 5 Playwright per modalità, esiti diversi, paging, errori, account e mobile. **Non eseguiti** finché quota GitHub Actions #112 è bloccata. Limiti aperti: scadenze senza esito persistito, tentativi malformati, correlazione alle ricompense realmente assegnate e consistenza a snapshot fisso quando nuovi eventi sono registrati durante l'offset paging; nessun dato viene inferito per mascherare tali lacune.

## Portali completati verificati — issue #119 (prima tranche)

**Prova persistente**: `exclusive_content_grants.ConsumedAtUtc` da solo non è sufficiente a dedurre il completamento di una sfida storica; un'assegnazione inventario è ancor meno sufficiente. La prima tranche usa `game_events` con `EventType="exclusive_content.consumed"` e payload JSONB `data.challengeType="sequence"`, filtrando anche owner, `PortalKey="challenge.sequence.v1"`, grant consumato e rapporto causale `game_events.CausationId = exclusive_content_grants.GrantEventId`. Poiché l'evento viene salvato **nella stessa transazione** che consuma il grant dopo il confronto delle rune sul server, il risultato può essere definito *completato e verificato*. Grant legacy privi di evento e tipologie non sequence vengono deliberatamente **esclusi**, senza retrodatazioni arbitrarie.

**Endpoint**: `GET /api/personal-content/history/completed?page=1&pageSize=20`, JWT richiesto. Identità da claim `NameIdentifier`, mai da query. `page` tra 1 e 1000 e `pageSize` tra 1 e 50; altrimenti HTTP 400 `portal_history_invalid_pagination`. Risposta `{items:[{grantId,contentKey,ruleVersion,grantedAtUtc,completedAtUtc}],page,pageSize,hasMore}`. Ordinamento `OccurredAtUtc DESC, EventId DESC`, con `Take(pageSize+1)`. Indice DB additivo `IX_game_events_PlayerId_EventType_OccurredAtUtc_EventId` (migrazione `202611060001`). Pagina numerica limitata: l'ordinamento è deterministico a snapshot invariato; nuove vittorie registrate durante la navigazione possono spostare l'offset. Una vera paginazione a cursore con snapshot sarà un perfezionamento successivo, se necessario. Non esporre seed, soluzione, token o rewardKeys non confermati.

**Diario**: sezione separata `RefugePortalCompletionHistory` della vista #118, con pages "Mostra altri", loading/empty/error/retry, refresh manuale e refresh globale che rimonta il componente. Guest senza API; account switch smonta il modello del vecchio giocatore. La sezione non effettua POST né importa Phaser. Nome contenuto e versione sono identificativi canonici, non narrativa generata.

**Perimetro non coperto**: fallimenti e tentativi invalidi, esiti Guardian PvE, portali scaduti, eventi vecchi privi di prova, eventuale correlazione a ricompense realmente assegnate. Non spacciare il diario come completo finché il contratto non includerà queste categorie e audit correlati. La issue #119 rimane aperta fino a espansione/review. API unit test per JWT/proprietario/paginazione/input, integrazione PostgreSQL con eventi di completamento reali e consumi legacy non provati, più 5 Playwright di UI sono predisposti, **non eseguiti** per blocco GitHub Actions #112.

## Diario del Rifugio — issue #118 (letture esistenti)

Un Diario navigabile da `/#/refuge` tramite `/#/refuge/journal` riunisce le informazioni di progressione **già disponibili** senza aggiungere un secondo stato di gioco e senza attivare Phaser. L'accesso richiede una sessione VUXO; le richieste sono sempre owner-only e il componente React si rimonta quando cambia il token.

1. **Assegnazioni di oggetti**: `fetchPlayerInventory` legge `GET /api/inventory` e restituisce i grant con itemKey, quantità, `awardedAtUtc` e eventuale `consumed`. Il diario ordina per data (recente prima), traduce i codici noti e consente il filtro visivo tutti/non consumati/consumati. La quantità è quella registrata nell'assegnazione; `not consumed` non significa necessariamente utilizzabile/equipaggiabile (potrebbe essere già equipaggiato, bloccato da un incontro, o soggetto a cooldown). Un grant sconosciuto si mostra come oggetto non catalogato e non viene inventato un nome.
2. **Portali disponibili adesso**: `fetchPortalGrants` legge `GET /api/personal-content` e limita ai portali con `portalKey=challenge.sequence.v1` restituiti dal backend. L'ordine segue l'eventuale scadenza (prima le più vicine, poi le non segnalate). La scheda non tenta la sfida da sola: porta a `/#/portals`. Una risposta senza grants **non** significa che non siano mai state completate sfide.
3. **Gestione rigorosa degli stati**: caricamento/errore/empty distinti per entrambi gli endpoint, retry indipendente, refresh completo che invalida immediatamente gli snapshot precedenti. AbortController e remount su cambio token evitano fughe tra account. Guest: nessuna chiamata privata e invito al login. Nessuna POST, nuova migration, XP o ricompensa da UI.

**Evoluzione #119:** la nuova sezione di completamenti verificati fornisce una prova server-side per le sole sfide di sequenza auditabili (vedi sopra). Questo NON è ancora uno storico esaustivo delle avventure, dei fallimenti o dei portali scaduti. Non è possibile dedurre vittorie o provenienza delle ricompense da una riga di inventario: il completamento proviene esclusivamente dall'evento causale corrispondente. L'unificazione della timeline richiede ulteriori read model e correlazione sicura degli oggetti.

La suite Playwright introdotta da #118 copre guest, ordinamento cronologico, portali disponibili (non altri contenuti), filtri, errori/retry parziali, refresh globale, cambio account/logout e mobile inglese/dark senza Phaser o mutazioni. **Test non eseguiti** mentre quota Actions #112 resta bloccata. La feature deve rimanere su branch isolato fino a build/CI e review.

## Integrazione delle esperienze off-world — issue #120

Le superfici del gioco esterne a Phaser sono finalmente rappresentate in **un unico snapshot di codice di lavoro**: home con sigillo giocabile, inventario con filtri e slot Reliquia/Amuleto, Rifugio con salute autorevole + preparazione + guida alla prossima attività, Diario con assegnazioni inventario, portali disponibili, completamenti ed esiti auditati, ricompense collegate per causalità. L'integrazione non cambia gameplay e non sostituisce i controlli di proprietà o ricompensa del backend.

La `RefugePage` combina le modifiche concorrenti: mantiene lo stato salute per token e il refresh coerente di preparazione (branch #117), **oltre** alla scheda Diario (branch #119). Il file delle risorse `i18n.ts` unisce, in entrambi i dizionari IT/EN, le sezioni `home.teaser`, `inventory.browse/loadout`, `refuge.preparation/journey/journal` e i dettagli delle ricompense verificate. I componenti, le API e i test originali dei branch restano intatti per consentire regressioni specifiche. Tre nuovi test Playwright sul branch integrato validano percorsi congiunti guest/owner e mobile.

La struttura dei branch originali è preservata per audit e debug. **Il nuovo branch non è una release o un merge su main**, e nessuna suite è stata eseguita realmente in assenza di capacità CI (#112). La successiva revisione deve includere `npm run build`, test React/Playwright, `dotnet test`, integrazioni PostgreSQL/migrazioni e controllo del deploy GitHub Pages prima di qualunque merge.

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

## Percorso guidato di preparazione — issue #117

La nuova guida contestuale `RefugeJourneyGuide` è interna al pannello `RefugePreparationBoard` dell'issue #114 e usa **gli stessi dati già letti**, senza endpoint aggiuntivi. La funzione pura `deriveJourneySteps` restituisce indicazioni, mai un punteggio di prontezza o un flag di autorizzazione:
- Salute: 0 HP significa che riposo e Seme del Bosco non possono curare il personaggio secondo le regole correnti; il link porta alla scheda personaggio solo per consultazione. HP non pieni rimandano alla sezione Cura/Riposo già presente nel Rifugio; HP pieni offrono l'allenamento libero delle rune.
- Equipaggiamento: 0, 1 o 2 slot confermati porta all'Inventario; se la richiesta fallisce, lo stato rimane **non verificato** con proposta di rilettura. Gli slot realmente equipaggiati provengono da `GET /api/equipment`.
- Portali: incontro attivo porta alla pagina portali; assente propone consultazione; risposta fallita resta **stato sconosciuto** e permette un refresh. Lo stato è solo informativo: il server continua a verificare eventuali lock per combattimenti, cura e riposo.

**Correzione refresh #114:** prima il pulsante incrementava solo il contatore di caricamento salute mentre `RefugePreparationBoard` aggiornava equipaggiamento e incontro soltanto quando cambiava il token. Ora il refresh invalida immediatamente i dati salute del token attivo, smonta la guida e ricarica la salute; dopo la nuova risposta del server ricrea `RefugePreparationBoard`, che legge di nuovo equipaggiamento e incontro. I risultati vecchi non restano visibili accanto a quelli nuovi durante la sincronizzazione. Ogni GET mantiene `AbortController` e cancellazione all'unmount. Su guest, 404 salute e logout il pannello non appare e nessuna GET di equipment/encounter viene effettuata dalla guida.

La guida non salva una checklist o inventa missioni, non concede premi e non abilita né blocca pulsanti di gioco: le restrizioni restano autorevoli sul backend. Copie IT/EN, uso tastiera e viewport 320px. Nuovi test Playwright: piena salute, ferite/scroll al riposo, 0 HP, errori parziali+retry completo, ospite/404, cambio token/logout, EN/dark/mobile senza Phaser. CI in sospeso per quota Actions #112; sviluppo stacked sulla branch dell'issue #114.

## Preparazione dell’avventura — issue #114 (UI di sola lettura)

Il Rifugio può mostrare un **riepilogo della sessione** senza creare uno stato di gameplay parallelo. Il componente `RefugePreparationBoard` legge solo le API già esistenti (nessuna nuova route backend):
- `GET /api/characters/me/health`: riutilizza i valori canonici già caricati in `RefugePage`, legati al token effettivo della sessione, comprese le modifiche confermate dal riposo server-side;
- `GET /api/equipment`: due slot relic/charm effettivi, senza inferire che uno slot non letto sia vuoto;
- `GET /api/characters/me/encounter`: stato attivo/non attivo, oppure sconosciuto se il server non risponde. La UI **non** decide se riposo, cura o ingresso nel mondo siano ammessi; la validazione e i blocchi restano nel backend.

Il pannello compare solo con sessione e personaggio esistenti: gli ospiti e i 404 salute non richiedono dati di equipaggiamento/incontro. Il cambio account smonta il pannello e la vista HP non mostra risultati appartenenti al token precedente; ogni richiesta è cancellabile tramite AbortController. Il refresh manuale rilegge salute, equipaggiamento e incontro. La visualizzazione di HP mancanti/zero è soltanto informativa, senza score di prontezza, missioni, premi o persistenza nel browser.

I test Playwright includono utente guest, stato autenticato con equipaggiamento e incontro attivi, fallimenti parziali e recupero, 404, switch/logout, aggiornamento dopo riposo server, i18n English/dark/mobile 320px. La validazione CI resta in sospeso per quota Actions esaurita (#112): non mergiare o distribuire finché non sono verificate build e suite.

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
