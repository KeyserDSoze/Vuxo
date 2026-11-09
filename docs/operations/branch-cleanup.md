# Pulizia GitHub controllata — issue #142

Il merge squash non conserva come antenato il commit di origine della PR.
Non usare in modo indiscriminato git branch --merged.

L'8 novembre 2026 sono stati identificati 33 branch i cui SHA coincidono
esattamente con il commit head di una PR già mergiata. Il manifest nel file
scripts/maintenance/prune-merged-pr-branches.mjs congela nome, SHA e numero
della PR: nessun altro branch verrà considerato.

Prima di cancellare, il job rilegge la API GitHub: controlla PR merged,
repository head esatto, SHA corrente, branch non protetto, assenza di
PR aperte che usino il branch come sorgente o base; riverifica i ref
immediatamente prima di ogni DELETE. Errori di API bloccano l'operazione.

Il workflow .github/workflows/cleanup-merged-pr-branches.yml si attiva
al merge che aggiunge proprio il file su main, oppure manualmente. Un
workflow_dispatch senza conferma è in sola lettura; delete_eligible=true
è necessario per cancellare manualmente. Solo GitHub Actions su main,
con GITHUB_TOKEN a contents:write, può applicare le cancellazioni.
L'esito va controllato nei log: un merge non prova che i branch siano rimossi.

Restano esplicitamente esclusi branch off-world incompleti (PR #99-#110),
lavori #114/#117/#119, PR Phaser #80 e i branch di infrastruttura non
integrati. Non eliminarli fino a nuova review, test e piano di delivery.
L'ultimo controllo pubblico health Pi è fallito nella run #42523017704:
questa operazione non deve mascherarlo né modificare dati dei giocatori.

## Audit finale — 9 novembre 2026

Una nuova lettura GitHub dell'elenco completo dei branch ha restituito **35 ref**, di cui **34 diversi da main**. Nessuno dei **33 nomi** congelati in `CANDIDATES` è ancora presente: l'obiettivo di rimozione dei ref già mergiati è verificato per stato finale, senza attribuire cancellazioni a un job non ispezionato. Nessun ulteriore ref è stato eliminato in questo audit. Restano intatti i cinque branch di PR ancora aperte (#110, #102, #60, #49, #46) e altri branch fuori manifest, che richiedono esame separato prima di qualunque merge o rimozione. Issue #142 chiusa con ledger e patch note aggiornate.
