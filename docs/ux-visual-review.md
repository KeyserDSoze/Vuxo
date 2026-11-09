# UX game-first — raccolta prove visive (#165)

La matrice screenshot serve alla review di **#154**, dei pannelli **#158** e del mondo **#155**. Non sostituisce una sessione reale su browser e dispositivi fisici, né dimostra che la Fullscreen API funzioni ovunque.

## Esecuzione

1. In GitHub: **Actions → UX visual review → Run workflow**, selezionare **main**. In caso di modifica di workflow o suite, il job parte anche con push su main.
2. Aprire la run completata e scaricare l'artifact **ux-visual-evidence**. Contiene il report HTML (immagini allegate), i PNG per i singoli test e le metriche JSON.
3. Confrontare Home, mondo, Rifugio, Inventario, Character Studio e Portali alle viewport **320×568**, **390×844**, **768×1024**, **1280×720**, **1920×1080**, **3440×1440** con **IT/chiaro** ed **EN/scuro**, sempre con reduced motion.
4. Verificare leggibilità/contrasto; rail/dock, focus e target touch; sovrapposizioni HUD/avvisi; assenza di scroll del documento; scroll confinato ai pannelli; canvas senza bande; ispezione oggetto e preview runica. Per ogni difetto aprire una issue con route, viewport, variante e screenshot, collegandola a #154.
5. Eseguire **a parte** QA manuale fullscreen su browser/hardware reale (F, pulsante, Esc, orientamento, errori Fullscreen API, dialog portali/duello sopra il mondo) e prove focus/tastiera. Non chiudere #155 o #158 solo perché l'artifact è disponibile.

## Limiti e sicurezza

- **Home, mondo, editor**: stato guest. **Rifugio, inventario, portali**: dati fixture owner sintetici, mai account OAuth o PostgreSQL reali.
- Il test intercetta tutti gli endpoint /api/ per la pagina; risposte mancanti sono 503 e scritture 405. Per il mondo non è simulata una vera sessione multiplayer: si valuta la resa del canvas e l'HUD in stato offline, non la correttezza realtime.
- Le metriche JSON contengono dimensioni viewport/documento, tema e stato fullscreen (normalmente **false**). Il test verifica overflow/canvas-host, non il fullscreen fisico.
- CI, GitHub Pages e browser/API/PostgreSQL live E2E sono gate separati, non sostituiti da questo workflow. Nessun segreto, deploy, migrazione o ricompensa nuova.

Esecuzione locale da src/frontend: installare le dipendenze e Chromium, poi impostare VUXO_VISUAL_REVIEW=1 e avviare "npx playwright test tests/ux-visual-review.spec.ts". In PowerShell: "$env:VUXO_VISUAL_REVIEW='1'". In assenza della variabile la normale suite Playwright non aggiunge nuovi test.
