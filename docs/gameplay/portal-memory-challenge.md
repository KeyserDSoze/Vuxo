# Sfida di memoria dei portali (issue #50)

## Gioco
Il primo portale giocabile propone quattro rune (sun, moon, star, wave) da memorizzare e ripetere. La schermata React/MUI mostra le rune per 3,5 secondi, poi il giocatore le seleziona con pulsanti accessibili anche da touch e tastiera. La navigazione Portali è localizzata in IT/EN.

## Predisposizione da GameMaster
Un GameMaster può assegnare un grant usando POST /api/admin/personal-content/grants, con il playerId del destinatario, un contentKey canonico, portalKey = challenge.sequence.v1, un seed numerico e una ruleVersion (oltre ai normali campi SourceEventId, DialogBranchKey, RewardKey ecc.). Solo il destinatario vede il portale nella nuova pagina.

## API autorevole
- GET /api/personal-content/{grantId}/challenge: richiede JWT e grant proprietario attivo; restituisce version e sequence, senza seed, rewardKey o metadata di audit.
- POST /api/personal-content/{grantId}/challenge/attempt: riceve una sequenza di quattro identificativi rune. Il backend ricalcola la sequenza dal seed e dalla versione registrati sul grant. Input malformato 400, sequenza errata 422, grant consumato o scaduto 409, altro proprietario 404.
- La precedente POST /api/personal-content/{grantId}/consume rifiuta i grant di tipo challenge.sequence.v1 (409 portal_challenge_required).
- Per i tentativi vige un rate limit di 12/minuto per IP, con HTTP 429 al superamento. Non costituisce protezione anti-bot perfetta: le rune sono mostrate intenzionalmente dal client.
- Il successo consuma il grant in modo persistente e produce un evento di audit player-scoped exclusive_content.consumed con challengeType e challengeVersion, mantenendo correlazione, causazione e regole storiche. ConsumedAtUtc è un concurrency token EF per prevenire doppi consumi simultanei senza nuova migrazione.
- Il grant consumato non è più disponibile né ripetibile.

## Limiti espliciti
Il prototipo NON accreditata automaticamente inventario, monete o esperienza: il rewardKey del grant è un riferimento canonico, non un pagamento. Il posizionamento del portale dentro Phaser, i puzzle aggiuntivi (danza, riflessi, bellezza, atletica, combattimento), un sistema ricompense transazionale e un anti-bot più forte saranno sviluppi successivi.

## Verifiche richieste
- Domain xUnit per seed deterministico, versione e input validi/invalidi.
- Application/API xUnit per autorizzazione, risultato, audit, replay e bypass.
- Playwright per accesso, UX IT/EN, mobile e successo/errore.
- CI dotnet, npm/Playwright e Docker runtime.
