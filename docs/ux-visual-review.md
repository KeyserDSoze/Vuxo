# UX game-first — raccolta prove visive (#165)

La matrice screenshot serve alla review di **#154**, dei pannelli **#158** e del mondo **#155**. Non sostituisce una sessione reale su browser e dispositivi fisici, né dimostra che la Fullscreen API funzioni ovunque.

## Avatar con quattro orientamenti (#191 — 11 novembre 2026)

L'art v2 (`vuxo-world-art-v2`) usa viste originali frontale, posteriore e di profilo specchiato e orientamento dai soli delta di posizione target ricevuti dal server, non da input locale. Confrontare gli allegati Playwright `server-faced-north-390px`, `server-faced-west-390px` e i PNG dei due browser a 390/1280; controllare occhi/volto nascosti nella vista di schiena, silhouette laterale, ancoraggio piedi, nome/portale e leggibilità rispetto al terreno. La [CI #43017357691](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43017357691) ha passato **317 test Playwright**, inclusa la prova delle quattro direzioni e del facing riflesso sul peer; la [Visual #43017357812](https://github.com/KeyserDSoZe/Vuxo/actions/runs/43017357812) ha passato **116/116**. Questi dati dimostrano il contratto/rendering nei browser test, **non** la revisione umana artistica o un test fullscreen fisico: #165/#167/#155 restano aperte.

## Sottobosco deterministico e landmark decorativi (#193 — in verifica)

World art v3 (`vuxo-world-art-v3`) aggiunge tronchi/felci/radure macro-tile sul solo Graphics del suolo. Il Playwright `world-art.spec.ts` confronta coordinate e forme dei landmark fra 320, 390, 768, 1280, 1920, 3440 px e reload, più la sovrapposizione con due browser di dimensioni diverse. Le immagini `woodland-landmarks-390`, `woodland-landmarks-1280`, `woodland-landmarks-3440` consentono la revisione delle differenze di densità e contrasto, non certificano la qualità artistica. Verificare che nessun oggetto ambientale sembri un portale o ostacolo vero; il gameplay non ha collisioni per questi disegni. La revisione su hardware resta #165/#167.

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

## Esito finale #173

La [CI #42695414456](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42695414456) ha passato **282 Playwright**, backend e Docker; [Live #42695413815](https://github.com/KeyserDSoze/Vuxo/actions/runs/42695413815) **3 test real browser/API/PostgreSQL/SignalR**, [Visual #42693836368](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42693836368) **75 test**, Pages #42695414305 success. I test provano che il Character Studio salva un look dopo la creazione e che due client online vedono l'aggiornamento senza spoofing, con CAS e reconnect. La review fisica full screen #155, scala avatar desktop #174, art direction #167 e stabilità API pubblica Cloudflare #147 sono attività diverse.

## Camera del mondo (#174): QA zoom e worldView

La camera Phaser usa `WorldCamera.ts` per zoom statico da 1 a 1,9 secondo il canvas reale (320/390/768/1280/1920/3440). `world-art.spec.ts` verifica due outfit autorevoli da mock, resize, niente scroll del documento, copertura tile = viewport camera/worldView e movimento server-owned. `world-portals.spec.ts` verifica il marker interattivo a zoom >1 e un resize 3440. La review manuale assistita delle prime immagini ha individuato fasce vuote (artifact [before #13711482545](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42700708361/artifacts/13711482545)); il passaggio a worldView le ha eliminate (artifact [after #13712340681](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42702099520/artifacts/13712340681)). Le trace del primo click ultrawide hanno confermato camera ancora in easing al resize, corretta sul commit `ca1b31f` ricentrando una sola volta il target. Ultimo artifact [#13712303613](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42704351524/artifacts/13712303613) Visual **76 pass**. Restano review vera hardware/display e fullscreen tramite #155/#165/#167; i test CI non sostituiscono accettazione artistica umana.


Il gate finale applicativo [CI #42704351760](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42704351760) ha passato **286 test Playwright**, backend e Docker; il test di click del marker a 3440×1440 è incluso e verde. La revisione su dispositivi reali e vero fullscreen rimane un gate manuale distinto per #174/#155.

## Inventario — viste game-first #175

La suite di test owner-local verifica le quattro viste **Panoramica**, **Equipaggiamento**, **Zaino** e **Cronologia** senza aggiungere chiamate API al cambio vista. Lo slot del loadout apre lo Zaino con filtro e focus sul campo ricerca; il cambio account/auth revoca immediatamente selezione e dati precedenti. Le opzioni sono pulsanti `aria-pressed` tastiera-accessibili; la barra sticky è dentro lo scroll del Game Deck, anche a 320px. La [run visuale #42708138944](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42708138944) produce **76 screenshot test passati** e il [report #13715306013](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42708138944/artifacts/13715306013) aggiunge PNG `inventory-gear.png`, `inventory-bag.png`, `inventory-journal.png` per 390 e 1280 in IT/light e EN/dark; review manuale delle immagini conferma che contenuti e navigazione restano nel panel. Review contrasto, focus con screenreader e touch reali ancora inclusa nella #165/#158.

## Esito verifica finale #175

Codice finale `89bb94a`: [CI #42710599128](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42710599128) **288 Playwright passed**, backend/Docker success; [Visual #42710599429](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42710599429) **76 passed**, artifact [#13714973863](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42710599429/artifacts/13714973863) con viste inventario e nuove evidenze; [Pages #42710599140](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42710599140) e [Live #42710599130](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42710599130) success. Prima CI `ddcd56b` aveva tre fallimenti di test a causa del nuovo passaggio Gear→Bag e controlli non pertinenti alla UI (encounter GET); corretti mantenendo test keyboard/owner. L'ultimo fix assicura che la Cronologia mostri anche i grant consumati e non ereditati dai filtri Zaino. #175 chiusa dopo gate finali, #158/#165 rimangono aperte per QA umana completa.

## Bussola portali personali (#178)

La matrice base /game resta guest e non crea grant: non deve mostrare una bussola privata. La suite on-demand aggiunge **due screenshot owner sintetici** per il nuovo HUD portale (390×844 e 1280×720, IT/scuro). Il preview Vite conserva una sessione fake solo nel browser di test; l'endpoint world-portals è intercettato e restituisce un singolo grant artificiale a est (18.5, 4.5), senza fetch reale, credenziali produttive o mutazioni del backend. Il test esige presenza connessa, bussola a est con 14 caselle, canvas e document fit. Confrontare contrasto del quadrante, direzione della freccia e collisioni con controlli touch/pulsanti nel PNG. La review reale su hardware e la salute Cloudflare restano distinte (#155/#147).


## Radar tattico nel mondo (#181)

La matrice ospite /game mantiene i peer sintetici del mock world: il radar desktop mostra il self centrato e i peer visibili, senza inventare portali privati in assenza di sessione owner. Le due viste owner sintetiche già presenti (`private portal compass` a **390×844** e **1280×720**, IT/scuro) verificano adesso anche il radar. A 390px la mappa parte chiusa, viene aperta dal pulsante touch/tastiera e verificata insieme a bussola/canvas senza scroll del documento. A 1280px la minimappa è immediatamente visibile. I marcatori rappresentano solo le coordinate dei peer nel mock locale e un singolo grant inventato per la prova, **non** nuove API o contenuti dell'account reale. Lo screenshot non sostituisce QA reale fullscreen/device fisico #155/#165 o il controllo Cloudflare #147.


## Verifica automatica radar #181 (10 novembre 2026)

[Visual #42722064297](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42722064297) **78/78** conferma che i due screenshot owner sintetici a 390×844 e 1280×720 mostrano radar e bussola assieme, senza overflow del documento; la matrice di base rimane guest e non simula grant personali. [CI #42722064119](https://github.com/KeyserDSoZe/Vuxo/actions/runs/42722064119) **298/298 Playwright** copre multi-client con movimento dei peer, proiezione di un grant lontano sul bordo, distanza live, lingua IT/EN e apertura/chiusura mobile. Non è una revisione soggettiva dei PNG o una prova su dispositivi reali, che restano #165/#155/#167/#174.
