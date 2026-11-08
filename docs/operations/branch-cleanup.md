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
