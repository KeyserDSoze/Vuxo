# Pile inventario ed equipaggiamento v2 (issues #56 e #58)

## Modello di provenienza e quantità

Le ricompense sono sempre registrate come award immutabili `player_inventory_awards`, uno per ogni grant personale validamente consumato. L'inventario `GET /api/inventory` rimane retrocompatibile e restituisce lo storico dei singoli award.

Il nuovo `GET /api/inventory/stacks` proietta gli award dell'utente autenticato raggruppati per `itemKey`: `quantity` è il numero di award, `equippedQuantity` è il numero di quelle copie equipaggiate e `availableGrantIds` contiene solo le copie non equipaggiate dello stesso utente. **Non vengono cancellati o uniti gli award originali**: il grant resta la chiave primaria e di provenienza. Per la release 0.0.1 non esistono vendite, consumi di stack, crafting né monete.

## Catalogo equipaggiabile (server-authoritative)

| Chiave canonica | Slot | Bonus v2 |
|---|---|---|
| `item.rune_shard.v1` | `relic` | +1 Intelligenza / Intelligence |
| `item.grove_seed.v1` | `charm` | +1 Costituzione / Constitution |
| `item.tidal_pearl.v1` | `charm` | +1 Fortuna / Luck |
| `item.swift_feather.v1` | `charm` | +1 Destrezza / Dexterity (velocità world-authoritative) |

Regole `equipment-v2`: un solo award per slot, un award mai in due slot, nessun item che non provenga da un grant valido del proprietario. Gli item di tipo `charm` competono per lo stesso slot e devono essere rimossi prima di equipaggiare un'alternativa. È necessario avere un personaggio creato.

`PlayerAttributes` conserva i dieci punti attribuiti in fase di creazione: `EquipmentRules.Evaluate` restituisce **statistiche effettive proiettate**, separate dagli attributi base. Calcola anche salute teorica e moltiplicatore di velocità in anteprima; **la simulazione Phaser/SignalR utilizza adesso la Destrezza effettiva** per determinare la velocità del giocatore. Gli altri bonus restano disponibili nella proiezione delle statistiche e non alterano ancora salute/combattimento live. Il caricamento del loadout avviene su join/reconnect e le mutazioni equip/unequip aggiornano gli snapshot dopo il commit PostgreSQL.

## API

- `GET /api/inventory/stacks` — JWT required; stack del solo proprietario e grant disponibili;
- `GET /api/equipment` — JWT required; `items` (solo slot, id award e itemKey), `stats` calcolate dal backend (null senza personaggio) e `ruleVersion`; nessun identificativo di altri giocatori, seed o audit interno;
- `POST /api/equipment/{grantId}/equip` — il client invia solo il grant ID. Il server verifica proprietà, catalogo, personaggio e slot libero, salva la riga equip e `inventory.equipped` in **un unico SaveChanges** e ricalcola l'eventuale velocità di movimento;
- `DELETE /api/equipment/{slot}` — controlla slot e proprietario, salva la rimozione e `inventory.unequipped` nello stesso SaveChanges, quindi ripristina l'eventuale velocità del mondo.

Errori stabili e localizzati in UI: `equipment_item_not_owned` (404), `equipment_item_not_equippable` e `equipment_invalid_slot` (400), `equipment_item_already_equipped`, `equipment_slot_occupied`, `equipment_slot_empty`, `equipment_character_required`, `equipment_conflict` (409). Il rate limit usa la policy di gameplay esistente per le mutazioni.

## Persistenza, concorrenza e audit

Migrazione additiva `202611040002_PlayerEquipment`:
- aggiunge una chiave alternativa unica `(GrantId, PlayerId)` all'inventario esistente;
- crea `player_equipped_items` con PK `(PlayerId, Slot)`, indice univoco `GrantId` e FK composita `(GrantId, PlayerId)` verso l'award originale. La FK impedisce anche a una scrittura difettosa di associare un award a un proprietario diverso;
- non elimina né modifica reward esistenti e non introduce perdite di dati.

Gli eventi `inventory.equipped` e `inventory.unequipped` sono player-scoped, portano la stessa `CorrelationId` dell'award e `CausationId=AwardEventId`. Modifica DB ed evento sono salvati atomicamente con EF; collisioni di vincoli e richieste concorrenti non possono creare un doppio item equipaggiato.

## Test e limiti

xUnit Domain per slot/bonus/versione/conflitti; xUnit API per autenticazione/owner, quantità, slot occupati, errore 400/404/409 e audit; test su PostgreSQL reale per migration discovery, FK owner, unique GrantId, transazione rollback, equip/unequip e audit. Playwright prova pile, equip, rimozione, stato mobile IT/EN e anonimato; CI live E2E estende il percorso reale browser → portale → inventario → equip → PostgreSQL → unequip.

## Sync multiplayer in tempo reale (#58)

- `WorldHub.JoinWorld` carica il personaggio e gli award equipaggiati direttamente da PostgreSQL; passa gli item canonici a `WorldSimulation.Join`, che applica `EquipmentRules.Evaluate`. Non esiste nessun parametro client per la velocità o le statistiche.
- Dopo un equip/unequip **committato**, `WorldEquipmentNotifier` rilegge l'equip persistito, chiama `WorldSimulation.RefreshEquipment` e, solo se il moltiplicatore cambia, invia `world.playerUpdated` al gruppo SignalR esistente con una revisione incrementata. Le posizioni non sono alterate.
- La revisione invalida i risultati di tick già calcolati con velocità precedente, proteggendo da un avanzamento fuori ordine durante i cambi loadout; il tick successivo usa il nuovo moltiplicatore.
- Il peer e il client locale consumano lo stesso snapshot, così il pannello MUI può mostrare la velocità reale del server. Su riconnessione il loadout viene riletto da PostgreSQL senza credere al precedente socket.
- L'authority della 0.0.1 rimane un **singolo processo world**: per shard/server multipli servirebbe un routing della presenza e una proiezione dell'equip transazionale e distribuita.
- L'audit `inventory.equipped`/`inventory.unequipped` rimane l'unica fonte di mutazione persistente, senza nuovi eventi duplicati per la proiezione della velocità.

Per distribuire in produzione: backup + restore drill, applicazione additiva della migration già esistente e smoke endpoint autenticati, senza reset del volume del DB.
