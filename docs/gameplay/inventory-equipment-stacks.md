# Pile inventario ed equipaggiamento v1 (issue #56)

## Modello di provenienza e quantità

Le ricompense sono sempre registrate come award immutabili `player_inventory_awards`, uno per ogni grant personale validamente consumato. L'inventario `GET /api/inventory` rimane retrocompatibile e restituisce lo storico dei singoli award.

Il nuovo `GET /api/inventory/stacks` proietta gli award dell'utente autenticato raggruppati per `itemKey`: `quantity` è il numero di award, `equippedQuantity` è il numero di quelle copie equipaggiate e `availableGrantIds` contiene solo le copie non equipaggiate dello stesso utente. **Non vengono cancellati o uniti gli award originali**: il grant resta la chiave primaria e di provenienza. Per la release 0.0.1 non esistono vendite, consumi di stack, crafting né monete.

## Catalogo equipaggiabile (server-authoritative)

| Chiave canonica | Slot | Bonus v1 |
|---|---|---|
| `item.rune_shard.v1` | `relic` | +1 Intelligenza / Intelligence |
| `item.grove_seed.v1` | `charm` | +1 Costituzione / Constitution |
| `item.tidal_pearl.v1` | `charm` | +1 Fortuna / Luck |

Regole `equipment-v1`: un solo award per slot, un award mai in due slot, nessun item che non provenga da un grant valido del proprietario. Gli item di tipo `charm` competono per lo stesso slot e devono essere rimossi prima di equipaggiare un'alternativa. È necessario avere un personaggio creato.

`PlayerAttributes` conserva i dieci punti attribuiti in fase di creazione: `EquipmentRules.Evaluate` restituisce **statistiche effettive proiettate**, separate dagli attributi base. Calcola anche salute teorica e moltiplicatore di velocità in anteprima; **la simulazione realtime Phaser/SignalR continua a utilizzare i dati base**, non i bonus dell'equipaggiamento. Questa separazione è intenzionale per evitare divergenze server/client finché non sarà implementato un aggiornamento autoritativo dei personaggi già connessi.

## API

- `GET /api/inventory/stacks` — JWT required; stack del solo proprietario e grant disponibili;
- `GET /api/equipment` — JWT required; `items` (solo slot, id award e itemKey), `stats` calcolate dal backend (null senza personaggio) e `ruleVersion`; nessun identificativo di altri giocatori, seed o audit interno;
- `POST /api/equipment/{grantId}/equip` — il client invia solo il grant ID. Il server verifica proprietà, catalogo, personaggio e slot libero, poi salva la riga equip e `inventory.equipped` in **un unico SaveChanges**;
- `DELETE /api/equipment/{slot}` — controlla slot e proprietario, salva la rimozione e `inventory.unequipped` nello stesso SaveChanges.

Errori stabili e localizzati in UI: `equipment_item_not_owned` (404), `equipment_item_not_equippable` e `equipment_invalid_slot` (400), `equipment_item_already_equipped`, `equipment_slot_occupied`, `equipment_slot_empty`, `equipment_character_required`, `equipment_conflict` (409). Il rate limit usa la policy di gameplay esistente per le mutazioni.

## Persistenza, concorrenza e audit

Migrazione additiva `202611040002_PlayerEquipment`:
- aggiunge una chiave alternativa unica `(GrantId, PlayerId)` all'inventario esistente;
- crea `player_equipped_items` con PK `(PlayerId, Slot)`, indice univoco `GrantId` e FK composita `(GrantId, PlayerId)` verso l'award originale. La FK impedisce anche a una scrittura difettosa di associare un award a un proprietario diverso;
- non elimina né modifica reward esistenti e non introduce perdite di dati.

Gli eventi `inventory.equipped` e `inventory.unequipped` sono player-scoped, portano la stessa `CorrelationId` dell'award e `CausationId=AwardEventId`. Modifica DB ed evento sono salvati atomicamente con EF; collisioni di vincoli e richieste concorrenti non possono creare un doppio item equipaggiato.

## Test e limiti

xUnit Domain per slot/bonus/versione/conflitti; xUnit API per autenticazione/owner, quantità, slot occupati, errore 400/404/409 e audit; test su PostgreSQL reale per migration discovery, FK owner, unique GrantId, transazione rollback, equip/unequip e audit. Playwright prova pile, equip, rimozione, stato mobile IT/EN e anonimato; CI live E2E estende il percorso reale browser → portale → inventario → equip → PostgreSQL → unequip.

Per distribuire in produzione: backup + restore drill, applicazione additiva della migration e smoke endpoint autenticati, senza reset del volume del DB.
