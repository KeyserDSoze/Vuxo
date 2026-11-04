# Inventario e ricompense atomiche (issue #54)

## Catalogo canonico 0.0.1
Gli oggetti attribuibili alle sfide sono definiti dal catalogo server `InventoryItemCatalog`, versionato e allowlisted:
- `item.rune_shard.v1` — Frammento di runa / Rune Shard
- `item.grove_seed.v1` — Seme del bosco / Grove Seed
- `item.tidal_pearl.v1` — Perla delle maree / Tidal Pearl
- `item.swift_feather.v1` — Piuma del vento / Swift Feather (+1 Destrezza quando equipaggiata nello slot charm)

Per assegnare un premio, il GameMaster crea normalmente un grant personale con `portalKey = challenge.sequence.v1` e `rewardKey` impostato a una delle quattro chiavi sopra. L'identità dell'oggetto arriva dal grant già concesso dal server, **mai dalla risposta o dal browser**. I grant esistenti con rewardKey sconosciuti restano consumabili secondo il comportamento storico ma non generano oggetti arbitrari. I grant consumati prima dell'introduzione dell'inventario **non sono backfillati**: l'assegnazione retroattiva richiederebbe una migrazione di prodotto esplicita e un controllo dei dati storici.

## Salvataggio e idempotenza
- Il dominio costruisce un `PlayerInventoryAward` solo da un grant consumato e da un item supportato; quantità esattamente 1.
- La tabella `player_inventory_awards` contiene: `GrantId` (PK e FK `exclusive_content_grants`, `ON DELETE RESTRICT`), `AwardEventId` univoco, `PlayerId`, `ItemKey`, `AwardedAtUtc`, `CorrelationId`, `CausationId`. Indice per playerId e awardedAtUtc. La migrazione è additiva `202611040001_PlayerInventoryAwards`.
- L'application service inserisce nella **stessa unit of work**: `ConsumedAtUtc` del grant, audit `exclusive_content.consumed`, riga award e audit `inventory.item_awarded`. Il secondo evento ha come causationId l'ID del primo e preserva il correlationId del grant.
- **Una sola `SaveChangesAsync`** EF Core esegue le modifiche in una transazione PostgreSQL. In caso di fallimento nessun grant è parzialmente consumato e nessun award/audit rimane nella tabella.
- La PK `GrantId` impedisce la duplicazione di premi in richieste concorrenti; l'esistente concurrency token `ConsumedAtUtc` impedisce la ripetizione del consumo del grant stesso. Il client riceve 409 ai replay.
- Le ricompense sono **una copia non impilata per grant** (quantità 1). Il sistema equipaggiamento è stato successivamente aggiunto nelle issue #56/#58: le quantità rimangono proiezioni non distruttive, non esistono trading/crafting/monete nella 0.0.1.

## API e UI
- `GET /api/inventory` richiede la sessione JWT, legge esclusivamente l'inventario del giocatore e restituisce `grantId, itemKey, quantity=1, awardedAtUtc`. Correlation/causation e dati di altri giocatori non sono esposti.
- La risposta di successo della challenge include `itemKey` per i premi canonici, oppure `null` per grant legacy non riconosciuti.
- La pagina `#/inventory` mostra gli oggetti, quantità e data, con nome IT/EN. La schermata della challenge (sia standalone sia nel mondo Phaser) mostra il messaggio `Oggetto ottenuto` solo dopo successo confermato dal backend.

## Test e limitazioni
- Domain xUnit: allowlist, chiavi contraffatte, causalità, rifiuto di grant non consumati.
- Application/API xUnit: errato/non-owner/scaduto/replay non premiano; award corretto, audit collegato, /api/inventory autenticato e isolato per player.
- PostgreSQL integration: persistenza di item/audit/grant, PK unica e rollback forzato di SaveChanges (FK non valida), dimostrando atomicità delle scritture.
- Playwright: auth, inventario vuoto, rendering mobile IT/EN, reward receipt dopo sfida; live E2E prova browser → API → PostgreSQL.
- Deployment: la migration va applicata con backup/database drill prima del nuovo runtime. **Non eseguire reset database né `docker compose down -v`.**

Il seguito prevede catalogo item più ricco, consumi/crafting transazionali, distribuzione automatica delle ricompense da regole di gioco e marketplace; sono funzionalità distinte.
