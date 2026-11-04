# Portali personali nel mondo Phaser (issue #52)

## Flusso giocabile
Dopo il login e la creazione del personaggio, il giocatore entra nella mappa condivisa. I grant personali attivi di tipo `challenge.sequence.v1` sono proiettati dal backend come portali 2D (anelli originali viola). La scena Phaser li rappresenta e consente il click; una barra MUI accessibile offre inoltre un pulsante **Entra nel portale** abilitato quando il giocatore è vicino. Su mobile sono disponibili gli stessi pulsanti e i controlli touch di movimento.

L'ingresso apre un dialog MUI nella pagina Gioco, senza abbandonare la sessione SignalR. Al suo interno si riutilizza la sfida di quattro rune della issue #50, con anteprima di 3,5 secondi e controllo della risposta lato server. Il movimento è sospeso mentre il dialog è aperto; al completamento il marker viene rimosso e il grant non risulta più disponibile.

## API e posizione autorevole
- `GET /api/personal-content/world-portals`: richiede JWT; se il giocatore non è collegato al mondo, restituisce un elenco vuoto. Se è collegato, seleziona dal database solo i suoi grant attivi di tipo `challenge.sequence.v1`. La risposta contiene id del grant, contentKey e coordinate proiettate dal server, **mai** seed, rewardKey, ID di altri giocatori o catene di audit.
- `POST /api/personal-content/world-portals/{grantId}/enter`: richiede JWT, proprietà del grant e grant ancora attivo; legge la posizione del giocatore da `WorldSimulation.Snapshot` e verifica la distanza dalla posizione del portale. Non accetta coordinate fornite dal client.
- Raggio d'ingresso: **1,5 tile**, con distanza euclidea inclusiva.
- Posizionamento `world-personal-portal-v1`: BFS su tile realmente percorribili connesse allo spawn, raggio di ricerca 5 passi. La scelta è deterministica via SHA-256 dell'ID grant, seed e versione delle regole; a parità di mondo/generatore/grant non cambia tra richieste. In assenza di percorsi a due tile di distanza si usano tile adiacenti o lo spawn, mantenendo una posizione comunque camminabile. Collisioni tra marker di grant diversi possono verificarsi nella 0.0.1.
- Il tentativo d'ingresso è limitato per IP a 12/min, come l'endpoint delle sfide. Restituisce `exclusive_content_not_found` (404) per grant inesistenti o di altri; `world_portal_not_joined`, `world_portal_too_far`, grant scaduti/consumati e portali non supportati con conflitto 409.
- Un ingresso valido **non consuma né premia**: la ricompensa è vincolata al completamento della sfida #50 e resta per ora una voce di audit, non un oggetto in inventario.

## Confini e futuri sviluppi
Il controllo autorevole usa `WorldSimulation` in memoria sul processo API: la 0.0.1 ha un processo world-authoritative, mentre un vero cluster multi-host richiederà la partizione degli shard e una directory della presenza affidabile. La pagina standalone Portali resta un accesso alternativo; non è stata trasformata in un percorso con vincolo di prossimità.

Il runtime 2D ha ancora una griglia/marker geometrici originali. Si prevedono tile e asset dedicati, portali con interno di livello, tipi di sfida aggiuntivi e ricompense d'inventario transazionali in issue successive.

## Test e contratti di qualità
- xUnit Domain: determinismo, selezione seed-based, raggio euclideo e coordinate non finite.
- xUnit API: autenticazione, grant privati, posizione ricavata dal server, negazione accessi da lontano / non connessi, spoofing e replay.
- Playwright: ingresso in gioco e dialog che completa realmente la sfida usando API mock per il test UI, mobile, assenza di sessione e messaggi IT/EN.
- CI: restore/build/test backend, frontend/Playwright, smoke Docker; il test end-to-end browser/API/PostgreSQL della feature #50 continua a essere eseguito.
