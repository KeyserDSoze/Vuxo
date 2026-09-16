# Avventure e contenuti esclusivi per giocatore

Vuxo può assegnare contenuti visibili o accessibili a un solo giocatore: portali personali, dialoghi NPC differenti, ricompense, side quest e sequenze narrative.

Ogni decisione deve essere ricostruibile. Il backend registra un evento append-only con almeno:

- player ID;
- tipo evento;
- content key;
- seed usato;
- versione della regola/algoritmo;
- correlation ID e causation ID;
- timestamp UTC;
- eventuale scadenza/consumo;
- payload necessario a spiegare la decisione.

I log tecnici non sostituiscono questo audit di dominio. Una modifica futura alle regole non deve rendere impossibile spiegare perché un contenuto era stato assegnato in passato.
