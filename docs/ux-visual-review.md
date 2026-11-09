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

## Aggiornamento world art #167

Dal commit `3a602fa`, `/game` mostra viandanti 2D procedurali e un terreno originale. La visual QA deve confrontare gli screenshot world a 320, 390, 1280, 1920 e 3440 pixel, più gli allegati `world-art-mobile-two-players` e `world-art-desktop-two-players` dei test multiplayer. Controllare contrasto, nomi vicini, portali, orientamento e leggibilità. Colori e silhouette **non** sono l'appearance salvata sul server. Lo screenshot automatico non chiude la verifica hardware/fullscreen #155.

## Copertura avatar reale nella matrice (issue #170)

La schermata `/game` nella matrice non è più un mondo ospite vuoto: il preview Vite viene resettato e avviato con **due giocatori sintetici** (`Visual Wanderer` e `Moon Wanderer`). Il test attende lo stato connected e due contenitori grafici Phaser creati, tramite il solo segnale E2E `data-e2e-illustrated-player-count=2`, oltre alle presenze testuali. La build di produzione non espone il segnale. La workflow visuale include anche `world-art.spec.ts` con screenshot due-browser e cambio viewport, usando un unico worker per evitare interferenze nel mock multiplayer condiviso. I dati sono esclusivamente locali; non contengono account, email o personaggi veri. Il test verifica che gli avatar siano stati creati, non sostituisce una revisione visiva umana né certifica la Fullscreen API di #155.

## Isolamento del mock multiplayer fra suite parallele (#172)

La preview di test `VITE_E2E_REALTIME=true` accetta `?scope=<id>` soltanto sui percorsi `/__vuxo_e2e/world/*`; il client locale legge `vuxo.e2eWorldScope`. Ogni scope mantiene una mappa giocatori e un indice spawn indipendenti, senza modificare il backend di produzione. La visual QA usa lo scope `visual-review`; i test `world-art.spec.ts` usano `world-art-duo` e `world-art-resize`, così le suite parallele non cancellano i dati del mondo usato dalle altre. Lo scope predefinito (parametro assente) preserva i test storici. Il test di isolamento verifica che join, movimento e reset in uno scope non modifichino i giocatori dell'altro.

## Costume persistito nel mondo (#169)

La matrice screenshot della scena `/game` verifica ora **due varianti cosmetiche originali** su due avatar del mondo mock: `Visual Wanderer` (capelli rossi, veste verde, gonna bianca) e `Moon Wanderer` (capelli biondi, parte superiore rossa, pelle scura). I valori sono caricati sul server di test Vite prima di entrare nel gioco, non in `localStorage`/in request di movimento. Il backend reale usa solo i dati persistiti in `PlayerCharacter` e la versione del catalogo `0.0.1`. Sui screenshot confrontare colori/stili fra i due peer e fra mobile/desktop; il layout vettoriale Phaser è una versione stilizzata della preview Character Studio, non una riproduzione pixel-perfect. Le foto non dimostrano il cambio look in diretta dopo un edit: questo è il lavoro previsto dalla #173.

## Esito matrice outfit canonici (9 novembre 2026)

La run [#42683217386](https://github.com/KeyserDSoze/Vuxo/actions/runs/42683217386) ha passato **75/75** scenari Playwright; il report/artifact [#13703567799](https://github.com/KeyserDSoze/Vuxo/actions/runs/42683217386/artifacts/13703567799) include screenshot di entrambi i costumi salvati nel mock. Confrontate IT/chiaro e EN/scuro a 320/390/1280/1920/3440 e segnalate differenze visive. La review dei PNG ha evidenziato un possibile miglioramento di scala/zoom a desktop e ultrawide, tracciato in #174. Il flusso di *modifica dopo creazione → broadcast live* non è ancora disponibile (#173), e gli screenshot non lo certificano.

## Character Studio — edit persistito (#173)

Le suite `character-studio.spec.ts` verificano il caricamento del personaggio autenticato, la disabilitazione di nome e caratteristiche, PATCH appearance con revision corrente, pulsante disabilitato quando il look è identico e conflitti 409 non spacciati per salvataggi riusciti. La workflow Visual parte quando cambia il Character Studio e continua a catturare la matrice. Il test `e2e-live/character-appearance.spec.ts` usa **browser + API + PostgreSQL + SignalR reali** per verificare due giocatori online e un terzo browser editore, l'evento post-commit, un retry idempotente, un conflitto CAS e reconnect; non utilizza il mock Vite per la posizione. La funzionalità non concede alcun XP, oggetto o altra modifica gameplay.
