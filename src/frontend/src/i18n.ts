import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readLanguagePreference, writeLanguagePreference, type SupportedLanguage } from './preferences/uiPreferences';

const initialLanguage = readLanguagePreference(navigator.language);

const initialization = i18n.use(initReactI18next).init({
  resources: {
    it: {
      translation: {
        nav: { home: 'Home', refuge: 'Rifugio', auth: 'Account', character: 'Personaggio', game: 'Gioco', portals: 'Portali', inventory: 'Inventario', admin: 'Admin', version: 'Versione' },
        shell: { theme: 'Tema', language: 'Lingua', navigation: 'Navigazione principale', openMenu: 'Apri menu', closeMenu: 'Chiudi', loadingPage: 'Caricamento pagina…', version: 'Versione {{version}}' },
        theme: { system: 'Sistema', light: 'Chiaro', dark: 'Scuro' },
        home: {
          eyebrow: 'VUXO · {{version}} · Prima avventura',
          chapter: 'Il richiamo dell’ignoto',
          title: 'Oltre il portale, inizia tutto.',
          description: 'Crea il tuo Vuxian, incontra altri esploratori e affronta sfide oltre ogni soglia. Questo mondo cambia con le scelte di chi lo attraversa.',
          cta: 'Entra nel mondo',
          ctaSignIn: 'Inizia l’avventura',
          ctaCharacter: 'Crea il tuo Vuxian',
          ctaRefuge: 'Scopri il Rifugio',
          sceneLabel: 'Ingresso al mondo di Vuxo',
          sceneFooter: 'Il mondo attende il tuo primo passo',
          pathsEyebrow: 'Tre strade, un universo',
          pathsTitle: 'Cosa vuoi scoprire?',
          pathsHint: 'Scegli una strada e osserva il portale cambiare.',
          pathSelected: 'Selezionato',
          pathPreview: 'Scopri',
          selectedEyebrow: 'La tua prossima avventura',
          discoverPath: 'Esplora questo percorso',
          portal: {
            toggle: 'Risveglia o calma il portale',
            hint: 'Tocca il portale per risvegliarlo',
            awake: 'Il portale risplende! Il sigillo ti aspetta appena sotto.'
          },
          teaser: {
            eyebrow: 'Il portale si è risvegliato',
            title: 'Decifra il sigillo',
            description: 'Un piccolo assaggio dell’avventura: osserva tre rune, memorizza l’ordine e prova a riaprirne il passaggio.',
            disclaimer: 'Solo una prova locale: nessun premio, XP o progresso viene salvato.',
            memorize: 'Memorizza queste rune nell’ordine mostrato.',
            ready: 'Sono pronto',
            repeat: 'Ora ripeti la sequenza e apri il sigillo.',
            progress: 'Rune scelte: {{count}} di {{total}}',
            runeChoices: 'Scegli le rune nell’ordine corretto',
            restart: 'Ricomincia',
            undo: 'Annulla ultima runa',
            failure: 'Il sigillo non si è aperto. Osserva di nuovo le rune e riprova.',
            retry: 'Osserva di nuovo',
            success: 'Sigillo aperto! Il percorso scelto ti attende.',
            continue: 'Prosegui verso il percorso',
            again: 'Rigioca il sigillo'
          },
          features: {
            character: {
              title: 'Il tuo Vuxian',
              description: 'Un eroe tutto tuo, dal volto agli attributi: decidi chi attraverserà la soglia.',
              preview: 'Dai forma al protagonista della tua storia.'
            },
            world: {
              title: 'Un mondo condiviso',
              description: 'Cammina tra altri esploratori in un universo 2D che prende vita.',
              preview: 'Avventurati dove altri Vuxian stanno già esplorando.'
            },
            portals: {
              title: 'Portali e sfide',
              description: 'Scopri passaggi misteriosi, rune e guardiani con prove tutte da superare.',
              preview: 'Ogni soglia nasconde una sfida diversa.'
            }
          }
        },
        refuge: {
          rest: {
            description: 'Riposa al Rifugio per recuperare fino al 25% degli HP massimi di base. Puoi farlo una volta ogni 30 minuti. Non consuma oggetti.',
            action: 'Riposa',
            retry: 'Riprova il riposo',
            inProgress: 'Riposo in corso…',
            success: 'Riposo completato! Hai recuperato {{amount}} HP.',
            cooldown: 'Hai già riposato di recente. Riprova dopo 30 minuti dall’ultimo riposo.',
            encounterActive: 'Un incontro del portale è ancora attivo. Completa la sfida o attendi che termini prima di riposare.',
            refreshEncounter: 'Aggiorna stato incontro',
            full: 'Sei già in piena salute.',
            downed: 'Con zero HP non puoi riposare: servirà un altro tipo di cura.',
            error: 'Non è stato possibile confermare il riposo. Riprova: la richiesta non sarà applicata due volte.'
          },
          health: {
            title: 'Salute del personaggio',
            description: 'Valori effettivi salvati dal server, condivisi con il tuo personaggio.',
            loading: 'Caricamento salute…',
            value: '{{current}} / {{maximum}} HP',
            baseMaxNote: 'Massimo di base: Costituzione × 10. I bonus equipaggiamento non influenzano ancora gli HP di gioco.',
            notFound: 'Non hai ancora un personaggio.',
            create: 'Crea personaggio',
            unavailable: 'Impossibile recuperare la salute dal server. Riprova.',
            retry: 'Riprova'
          },
          eyebrow: 'Il gioco continua oltre la mappa',
          title: 'Il tuo Rifugio',
          description: 'Prepara il tuo Vuxian, gestisci quello che possiedi e allenati anche senza entrare nel mondo 2D.',
          welcome: 'Bentornato, {{name}}',
          guest: 'Puoi allenarti anche senza un account. Per inventario, portali personali ed equipaggiamento serve una sessione VUXO.',
          enterWorld: 'Esplora il mondo',
          startTraining: 'Allenati con le rune',
          requiresAccount: 'Richiede accesso',
          availableWithoutAccount: 'Anche senza accesso',
          open: 'Apri',
          cards: {
            character: { title: 'Personaggio', description: 'Aspetto, attributi e preparazione del tuo Vuxian.' },
            inventory: { title: 'Inventario ed equipaggiamento', description: 'Controlla gli oggetti conquistati ed equipaggia reliquie e amuleti.' },
            portals: { title: 'Portali personali', description: 'Affronta sfide assegnate al tuo personaggio, con risultati verificati dal server.' },
            training: { title: 'Allenamento', description: 'Prova un minigioco di memoria delle rune, anche con il mondo offline.' },
            reflex: { title: 'Riflessi delle rune', description: 'Allenati a trovare la runa giusta in otto round veloci, senza bisogno del mondo.' }
          },
          care: {
            title: 'Cura e riposo',
            planned: 'In progettazione',
            description: 'Prevederemo cure, oggetti consumabili e riposo. La salute attuale e le risorse devono essere gestite dal server: qui non viene simulata alcuna cura.'
          },
          reflex: {
            eyebrow: 'Allenamento libero',
            title: 'Riflessi delle rune',
            description: 'Trova la runa indicata il più velocemente possibile. Otto round, nessun limite di tempo e tutti possono partecipare.',
            disclaimer: 'Solo pratica locale: nessuna ricompensa, esperienza, oggetto o risultato salvato. Le attività premiate sono verificate dal server.',
            instructions: 'Premi Inizia e seleziona la runa indicata per {{count}} round. Gli errori si contano ma puoi continuare.',
            start: 'Inizia',
            progress: 'Round {{current}} di {{total}}',
            find: 'Trova questa runa',
            choices: 'Rune disponibili',
            mistakes: 'Errori: {{count}}',
            complete: 'Allenamento completato!',
            hits: 'Centri: {{count}} / {{total}}',
            average: 'Reazione media: {{milliseconds}} ms',
            again: 'Rigioca',
            back: 'Torna al Rifugio'
          },          training: {
            eyebrow: 'Allenamento libero',
            title: 'Memoria delle rune',
            description: 'Memorizza la sequenza, poi ripetila nell’ordine corretto. Puoi allenarti quanto vuoi, senza entrare nel mondo.',
            disclaimer: 'È solo pratica locale: nessun premio, esperienza, oggetto o risultato persistente. Le sfide con ricompense sono validate dal server.',
            difficulty: 'Difficoltà',
            levels: { easy: 'Facile · 3 rune', standard: 'Normale · 4 rune', hard: 'Esperto · 6 rune' },
            memorize: 'Memorizza queste rune nell’ordine mostrato.',
            ready: 'Sono pronto',
            repeat: 'Ripeti la sequenza delle rune.',
            progress: 'Rune inserite: {{count}} di {{total}}',
            clear: 'Cancella la sequenza',
            check: 'Verifica',
            success: 'Ottimo! Sequenza corretta.',
            failure: 'Sequenza non corretta. Prova ancora!',
            accuracy: 'Posizioni corrette: {{correct}} su {{total}}',
            duration: 'Tempo di risposta: {{seconds}} s',
            again: 'Nuovo allenamento',
            back: 'Torna al Rifugio'
          }
        },
        auth: {
          title: 'Accedi a Vuxo',
          description: 'Usa Microsoft o Google. Il provider conferma la tua identità, poi Vuxo crea una sessione propria per gioco e realtime.',
          microsoft: 'Accedi con Microsoft',
          google: 'Accedi con Google',
          loadingProviders: 'Caricamento provider di accesso…',
          providersRetryHint: 'Il servizio di accesso non risponde. Puoi riprovare senza ricaricare la pagina.',
          retryProviders: 'Riprova',
          loadingProvider: 'Caricamento accesso Google',
          noProviders: 'Nessun provider social è configurato su questo ambiente.',
          signingIn: 'Accesso…',
          signedIn: 'Sessione Vuxo attiva',
          sessionExpiry: 'La sessione scade: {{date}}',
          continue: 'Continua al personaggio',
          logout: 'Esci',
          privacy: 'Vuxo non usa il token del provider come identità permanente: dopo la verifica conserva soltanto la propria sessione.',
          genericError: 'Non è stato possibile completare l’accesso.'
        },
        game: {
          guardian: {
            title: 'Duello contro il Guardiano',
            description: 'Scontro PvE facoltativo. Scegli Attacco o Parata: entrambe le carte vengono rivelate e risolte dal server. Questo duello non assegna premi; la ricompensa resta legata alla sfida di rune.',
            descriptionV2: 'Duello tattico PvE: scegli Attacco, Parata o Finta. Il Guardiano rivela la propria carta dopo la tua scelta; il server risolve il confronto senza premi aggiuntivi.',
            feintHelp: 'Finta: supera la Parata e infligge più danni con Destrezza elevata, ma contro Attacco non infligge danni e subisce 1 HP.',
            loading: 'Caricamento scontro…',
            enemyHealth: 'Guardiano: {{current}} / {{maximum}} HP',
            playerHealth: 'I tuoi HP: {{current}} / {{maximum}}',
            turn: 'Turno {{turn}} / {{maximum}}',
            choose: 'Scegli la tua carta per il confronto:',
            cards: { strike: 'Attacco', guard: 'Parata', feint: 'Finta' },
            turnResult: 'Tu: {{player}} · Guardiano: {{enemy}}. Danni inflitti: {{dealt}} HP; subiti: {{taken}} HP.',
            outcomes: {
              victory: 'Hai sconfitto il Guardiano! Il premio del portale resta legato alla sfida delle rune.',
              retreat: 'Ti sei ritirato dal duello. Recupera HP nel Rifugio dopo l’incontro.'
            },
            refuge: 'Vai al Rifugio',
            refresh: 'Aggiorna duello',
            retryTurn: 'Riprova la stessa azione',
            history: {
              title: 'Registro del duello',
              loading: 'Recupero dei turni…',
              empty: 'Nessuna mossa registrata in questo incontro.',
              error: 'Non è stato possibile recuperare il registro dei turni.',
              retry: 'Riprova',
              entry: 'Turno {{turn}} · Tu: {{player}}, Guardiano: {{enemy}} · Danni inflitti {{dealt}} HP, subiti {{taken}} HP · Guardiano {{guardian}} HP, tu {{health}} HP',
            },
            errors: {
              guardian_request_failed: 'Impossibile verificare il duello. Riprova senza inviare una nuova azione.',
              guardian_unavailable: 'Questo duello è disponibile solo dopo l’ingresso autorizzato nel portale dal mondo.',
              guardian_stale_turn: 'Il turno è già cambiato. Aggiorna il duello.',
              guardian_finished: 'Lo scontro è concluso. Aggiorna il duello.',
              guardian_too_injured: 'Hai pochi HP per combattere. Recupera salute dopo l’incontro.',
              guardian_idempotency_key_reused: 'Questa richiesta è già stata usata per un’altra carta.',
              guardian_invalid_action: 'Carta non valida.',
              guardian_invalid_turn: 'Turno non valido.',
              guardian_idempotency_key_required: 'Chiave dell’azione non valida.'
            }
          },
          title: 'Mondo condiviso',
          description: 'Il movimento è autoritativo lato server. Usa WASD, le frecce o i controlli touch per inviare i tuoi intenti.',
          playersOnline: 'Giocatori online: {{count}}',
          portal: {
            available: 'Portali personali nel mondo: {{count}}',
            enter: 'Entra nel portale {{number}}',
            moveCloser: 'Avvicinati a un portale per entrare. Puoi anche selezionare il suo simbolo sulla mappa.',
            challenge: 'Sfida del portale',
            genericError: 'Non è stato possibile entrare nel portale.'
          },
          connection: {
            idle: 'Offline',
            connecting: 'Connessione…',
            connected: 'Online',
            reconnecting: 'Riconnessione…',
            disconnected: 'Disconnesso',
            error: 'Errore',
            genericError: 'La connessione al mondo non è disponibile.'
          },
          controls: { up: 'Muovi su', down: 'Muovi giù', left: 'Muovi a sinistra', right: 'Muovi a destra' }
        },
        portals: {
          mistakeDamage: 'Il portale ti ha inflitto {{damage}} HP di danno. Salute: {{current}}/{{maximum}}.',
          mistakeAlreadyRecorded: 'Questo portale non infligge altri danni per ulteriori risposte errate. Salute: {{current}}/{{maximum}}.',
          visitRefuge: 'Vai al Rifugio',
          title: 'Sfide dei portali',
          description: 'Memorizza le rune dei portali personali e ripetile nell’ordine corretto. Il risultato è controllato dal server.',
          authenticationRequired: 'Accedi al tuo account Vuxo per partecipare alle sfide.',
          signIn: 'Accedi',
          loading: 'Caricamento dei portali…',
          available: 'Portali disponibili',
          empty: 'Non hai ancora portali con sfide attive. Un GameMaster può assegnarti un portale personale.',
          start: 'Inizia la sfida',
          memoryTitle: 'Sfida di memoria',
          memorize: 'Memorizza questa sequenza. Fra poco scomparirà.',
          repeat: 'Ripeti le quattro rune nel giusto ordine.',
          progress: 'Rune selezionate: {{current}} / {{total}}',
          submit: 'Conferma sequenza',
          reset: 'Ricomincia',
          showAgain: 'Mostra di nuovo',
          back: 'Torna ai portali',
          completed: 'Sfida completata! Il risultato è stato salvato.',
          awardReceived: 'Oggetto ottenuto: {{item}}. Lo trovi nel tuo inventario.',
          runes: { sun: 'Sole', moon: 'Luna', star: 'Stella', wave: 'Onda' },
          errors: {
            portal_authentication_required: 'Devi accedere per giocare.',
            portal_request_failed: 'Non è stato possibile comunicare con il server.',
            portal_challenge_not_available: 'Questa sfida non è disponibile.',
            portal_challenge_required: 'Devi completare la sfida prima di usare il portale.',
            portal_challenge_invalid_answer: 'La sequenza inserita non è valida.',
            portal_challenge_incorrect: 'Sequenza errata. Riprova.',
            world_portal_not_joined: 'Entra nel mondo condiviso prima di utilizzare il portale.',
            world_portal_too_far: 'Sei troppo lontano dal portale: avvicinati e riprova.',
            encounter_already_active: 'Hai già un altro incontro del portale attivo. Completa quello o attendi che scada.',
            encounter_portal_unavailable: 'Questo portale non è più disponibile per iniziare un incontro.',
            encounter_character_required: 'Crea un personaggio prima di entrare nel portale.',
            exclusive_content_not_found: 'Questo portale non è disponibile per il tuo personaggio.',
            exclusive_content_expired: 'Questo portale è scaduto.',
            exclusive_content_consumed: 'Questa sfida è già stata completata.'
          }
        },
        inventory: {
          healing: {
            use: 'Usa per curarti (+10 HP)',
            retry: 'Riprova utilizzo',
            working: 'Cura in corso…',
            success: 'Oggetto consumato: +{{restored}} HP ({{current}}/{{maximum}}).',
            refuge: 'Vedi salute nel Rifugio',
            refreshError: 'Cura confermata, ma impossibile aggiornare le quantità. Ricarica l’inventario.',
            encounterActive: 'Incontro del portale attivo: puoi usare il Seme del Bosco dopo la sfida o alla scadenza.',
            refreshEncounter: 'Aggiorna stato incontro'
          },
          title: 'Inventario',
          description: 'Gli oggetti ottenuti superando le sfide personali sono salvati sul server.',
          authenticationRequired: 'Accedi al tuo account Vuxo per consultare il tuo inventario.',
          signIn: 'Accedi',
          loading: 'Caricamento inventario…',
          empty: 'Non hai ancora oggetti. Completa un portale con una ricompensa per ottenerne uno.',
          owned: 'Oggetti ottenuti: {{count}}',
          consumed: 'Consumato',
          awardedAt: 'Ottenuto il {{date}}',
          quantity: 'Quantità: {{count}}',
          stacksTitle: 'Pile di oggetti',
          loadout: {
            title: 'Il tuo equipaggiamento',
            description: 'Reliquia e amuleto confermati dal server. Scegli cosa indossare dalle pile disponibili.',
            loading: 'Sincronizzazione equipaggiamento…',
            refresh: 'Aggiorna equipaggiamento',
            empty: 'Nessun oggetto equipaggiato',
            unknownItem: 'Oggetto equipaggiato',
            equipped: 'Equipaggiato',
            slotEmpty: 'Slot vuoto',
            unequip: 'Rimuovi dallo slot',
            replaceHint: 'Per sostituire questo oggetto, rimuovilo prima dallo slot.',
            find: 'Cerca oggetti compatibili',
            healingNote: 'Per consumare il Seme del Bosco come cura, rimuovilo prima dallo slot Amuleto.',
            serverNote: 'Solo il server conferma equipaggiamento e consumi. La ricerca non cambia gli oggetti.'
          },
          browse: {
            title: 'Trova i tuoi oggetti',
            search: 'Cerca oggetti',
            searchHint: 'Nome o codice dell’oggetto',
            slotLabel: 'Slot',
            slots: { all: 'Tutti gli slot' },
            filterLabel: 'Mostra',
            sortLabel: 'Ordina per',
            filters: { all: 'Tutti', equipped: 'Equipaggiati', available: 'Disponibili' },
            sorts: { name: 'Nome', quantity: 'Quantità (decrescente)' },
            results: 'Voci visualizzate: {{shown}} su {{total}}',
            noMatches: 'Nessun oggetto corrisponde a questi filtri. Gli oggetti non sono stati rimossi.',
            clear: 'Cancella filtri'
          },          stackQuantity: 'Copie possedute: {{count}}',
          equippedQuantity: 'Equipaggiate: {{count}}',
          equip: 'Equipaggia',
          unequip: 'Rimuovi',
          slots: { relic: 'Reliquia', charm: 'Amuleto' },
          effectiveStats: 'Statistiche con equipaggiamento',
          statsPreviewNote: 'Anteprima del carico equipaggiato. I bonus non modificano i punti base e non alterano ancora il movimento multiplayer.',
          maxHealth: 'Salute massima teorica: {{value}}',
          stats: {
            strength: 'Forza: {{value}} (+{{bonus}})',
            dexterity: 'Destrezza: {{value}} (+{{bonus}})',
            intelligence: 'Intelligenza: {{value}} (+{{bonus}})',
            constitution: 'Costituzione: {{value}} (+{{bonus}})',
            luck: 'Fortuna: {{value}} (+{{bonus}})',
            faith: 'Fede: {{value}} (+{{bonus}})'
          },
          items: {
            runeShard: 'Frammento di runa',
            groveSeed: 'Seme del bosco',
            tidalPearl: 'Perla delle maree'
          },
          errors: {
            inventory_authentication_required: 'Accedi per vedere il tuo inventario.',
            inventory_request_failed: 'Impossibile caricare l’inventario. Riprova.',
            equipment_item_not_owned: 'Questo oggetto non appartiene al tuo inventario.',
            equipment_item_not_equippable: 'Questo oggetto non può essere equipaggiato.',
            equipment_item_already_equipped: 'Questo oggetto è già equipaggiato.',
            equipment_slot_occupied: 'Slot occupato. Rimuovi prima l’oggetto equipaggiato.',
            equipment_character_required: 'Crea un personaggio prima di equipaggiare un oggetto.',
            equipment_invalid_slot: 'Slot di equipaggiamento non valido.',
            equipment_slot_empty: 'Questo slot è già vuoto.',
            equipment_conflict: 'Equipaggiamento modificato da un’altra richiesta. Ricarica la pagina.',
            heal_request_failed: 'Non è stato possibile confermare la cura. Riprova: l’oggetto non verrà consumato due volte.',
            heal_idempotency_key_required: 'Chiave della richiesta non valida.',
            heal_idempotency_key_reused: 'Richiesta già usata per un altro oggetto.',
            heal_item_not_owned: 'Non possiedi questo oggetto.',
            heal_item_not_consumable: 'Questo oggetto non può curare.',
            heal_item_equipped: 'Rimuovi prima il Seme del Bosco dallo slot Amuleto.',
            heal_conflict: 'L’oggetto è stato modificato da un’altra richiesta. Aggiorna l’inventario.',
            heal_item_used: 'Questo oggetto è già stato consumato.',
            heal_encounter_active: 'Non puoi curarti durante un incontro attivo del portale.',
            heal_already_full: 'Hai già la salute massima.',
            heal_unavailable: 'Non puoi usare questo oggetto con zero HP.',
            character_not_found: 'Crea un personaggio prima di curarti.'
          }
        },
        admin: { title: 'Amministrazione', description: 'Health, giocatori online, audit degli eventi, contenuti esclusivi e telemetria saranno raccolti qui.' },
        version: {
          title: 'Versione e build',
          description: 'Identifica la build frontend caricata e il backend a cui è connessa.',
          frontend: 'Frontend',
          backend: 'Backend',
          application: 'Applicazione',
          version: 'Versione',
          commit: 'Commit',
          buildUtc: 'Build UTC',
          informationalVersion: 'Versione informativa',
          environment: 'Ambiente',
          unknown: 'sconosciuto',
          unavailable: 'non disponibile',
          frontendUnavailable: 'I metadata della build frontend non sono disponibili.',
          backendUnavailable: 'I metadata del backend non sono disponibili.',
          update: { available: 'È disponibile una nuova build Vuxo ({{version}}).', reload: 'Ricarica' }
        },
        character: {
          editor: {
            eyebrow: 'Creazione personaggio',
            title: 'Costruisci il tuo Vuxian',
            description: 'Scegli un aspetto iniziale, distribuisci i 10 punti e controlla subito le statistiche derivate. Le regole finali vengono sempre validate dal server.',
            loading: 'Caricamento catalogo aspetto…',
            catalogError: 'Il catalogo del personaggio non è disponibile. Riprova quando l’API Vuxo è raggiungibile.',
            authenticationRequired: 'Puoi preparare e salvare le scelte localmente, ma serve una sessione Vuxo autenticata per creare il personaggio.',
            identity: 'Identità e attributi',
            name: 'Nome',
            attributes: 'Attributi',
            points: '{{used}} / {{total}} punti assegnati',
            appearance: 'Aspetto',
            catalogVersion: 'Catalogo aspetto {{version}}',
            create: 'Crea personaggio',
            saving: 'Creazione…',
            created: 'Personaggio creato. Le scelte sono state salvate dal server.',
            saveFailed: 'Non è stato possibile creare il personaggio.'
          },
          stats: { maxHealth: 'Vita massima', speed: 'Velocità' },
          attributes: {
            strength: 'Forza', dexterity: 'Destrezza', intelligence: 'Intelligenza', constitution: 'Costituzione', luck: 'Fortuna', faith: 'Fede'
          },
          appearance: {
            hairStyle: 'Capelli', hairColor: 'Colore capelli', face: 'Viso', bodyType: 'Corporatura', skinTone: 'Tonalità pelle',
            topColor: 'Colore maglia', bottomStyle: 'Parte inferiore', bottomColor: 'Colore parte inferiore', shoeStyle: 'Scarpe', shoeColor: 'Colore scarpe'
          },
          options: {
            hairStyle: { 'hair-1': 'Corti', 'hair-2': 'Medi', 'hair-3': 'Lunghi', 'hair-4': 'Ricci' },
            face: { 'face-1': 'Morbido', 'face-2': 'Angolare', 'face-3': 'Rotondo' },
            bodyType: { 'body-1': 'Snello', 'body-2': 'Medio', 'body-3': 'Robusto' },
            skinTone: { 'skin-1': 'Tonalità 1', 'skin-2': 'Tonalità 2', 'skin-3': 'Tonalità 3', 'skin-4': 'Tonalità 4', 'skin-5': 'Tonalità 5' },
            bottomStyle: { shorts: 'Pantaloncini', skirt: 'Gonna' },
            shoeStyle: { 'shoe-1': 'Sneaker', 'shoe-2': 'Stivaletti', 'shoe-3': 'Scarpe basse' },
            color: { black: 'Nero', brown: 'Marrone', blonde: 'Biondo', red: 'Rosso', blue: 'Blu', green: 'Verde', white: 'Bianco' }
          }
        },
        errors: {
          social_provider_configuration_unavailable: 'La configurazione dei provider di accesso non è disponibile.',
          social_provider_invalid: 'Provider di accesso non valido.',
          social_provider_not_configured: 'Questo provider non è configurato sul server Vuxo.',
          social_credential_invalid: 'La credenziale del provider non è valida.',
          social_credential_expired: 'La credenziale del provider è scaduta. Accedi di nuovo.',
          social_credential_audience_invalid: 'La credenziale è destinata a un’altra applicazione.',
          social_provider_unavailable: 'Il provider di accesso non è raggiungibile. Riprova.',
          social_login_cancelled: 'Accesso annullato o non completato.',
          social_login_failed: 'Non è stato possibile completare l’accesso social.',
          social_logout_failed: 'Non è stato possibile contattare il server durante l’uscita.',
          character_name_required: 'Inserisci un nome.',
          character_name_length_invalid: 'Il nome deve avere tra 3 e 24 caratteri.',
          character_attributes_negative: 'Gli attributi non possono essere negativi.',
          character_attribute_allocation_invalid: 'Devi assegnare esattamente 10 punti.',
          character_appearance_required: 'Scegli un aspetto per il personaggio.',
          character_appearance_option_invalid: 'Una scelta dell’aspetto non è più valida. Ricarica il catalogo.',
          character_already_exists: 'Questo account possiede già un personaggio.',
          world_authentication_required: 'Accedi a Vuxo prima di entrare nel mondo condiviso.',
          world_character_required: 'Crea prima un personaggio Vuxo.',
          world_connection_failed: 'Non è stato possibile connettersi al mondo.',
          world_reconnect_failed: 'La riconnessione al mondo non è riuscita.',
          world_session_replaced: 'Questa sessione è stata sostituita da una nuova connessione.',
          world_input_rejected: 'Il server ha rifiutato un input di movimento.'
        }
      }
    },
    en: {
      translation: {
        nav: { home: 'Home', refuge: 'Refuge', auth: 'Account', character: 'Character', game: 'Game', portals: 'Portals', inventory: 'Inventory', admin: 'Admin', version: 'Version' },
        shell: { theme: 'Theme', language: 'Language', navigation: 'Main navigation', openMenu: 'Open menu', closeMenu: 'Close', loadingPage: 'Loading page…', version: 'Version {{version}}' },
        theme: { system: 'System', light: 'Light', dark: 'Dark' },
        home: {
          eyebrow: 'VUXO · {{version}} · First adventure',
          chapter: 'The call of the unknown',
          title: 'Beyond the portal, everything begins.',
          description: 'Create your Vuxian, meet other explorers and face challenges beyond every threshold. This world changes with the choices of those who enter.',
          cta: 'Enter the world',
          ctaSignIn: 'Begin your adventure',
          ctaCharacter: 'Create your Vuxian',
          ctaRefuge: 'Discover the Refuge',
          sceneLabel: 'Gateway into the world of Vuxo',
          sceneFooter: 'The world awaits your first step',
          pathsEyebrow: 'Three paths, one universe',
          pathsTitle: 'What will you discover?',
          pathsHint: 'Choose a path and watch the portal change.',
          pathSelected: 'Selected',
          pathPreview: 'Explore',
          selectedEyebrow: 'Your next adventure',
          discoverPath: 'Explore this path',
          portal: {
            toggle: 'Awaken or quiet the portal',
            hint: 'Touch the portal to awaken it',
            awake: 'The portal is glowing! Decode the sigil just below.'
          },
          teaser: {
            eyebrow: 'The portal has awakened',
            title: 'Decode the sigil',
            description: 'A taste of the adventure: study three runes, remember their order, then try to reopen the passage.',
            disclaimer: 'Local practice only: no rewards, XP or progress are saved.',
            memorize: 'Remember these runes in the order shown.',
            ready: "I'm ready",
            repeat: 'Now repeat the sequence to open the sigil.',
            progress: 'Runes selected: {{count}} of {{total}}',
            runeChoices: 'Choose the runes in the correct order',
            restart: 'Start over',
            undo: 'Undo last rune',
            failure: 'The sigil did not open. Study the runes and try again.',
            retry: 'Study again',
            success: 'Sigil unlocked! Your chosen path awaits.',
            continue: 'Continue to your path',
            again: 'Play the sigil again'
          },
          features: {
            character: {
              title: 'Your Vuxian',
              description: 'Your own hero, from appearance to abilities: choose who crosses the threshold.',
              preview: 'Shape the hero of your own story.'
            },
            world: {
              title: 'A shared world',
              description: 'Walk among other explorers in a living 2D universe.',
              preview: 'Go where other Vuxians are already exploring.'
            },
            portals: {
              title: 'Portals and challenges',
              description: 'Discover mysterious passages, runes and guardians with challenges to overcome.',
              preview: 'Every gateway hides a different challenge.'
            }
          }
        },
        refuge: {
          rest: {
            description: 'Rest at the Refuge to recover up to 25% of your base maximum HP. You can do this once every 30 minutes. No items are consumed.',
            action: 'Rest',
            retry: 'Retry rest',
            inProgress: 'Resting…',
            success: 'Rest completed! You recovered {{amount}} HP.',
            cooldown: 'You have rested recently. Try again 30 minutes after your last rest.',
            encounterActive: 'A portal encounter is still active. Finish the challenge or wait for it to end before resting.',
            refreshEncounter: 'Refresh encounter status',
            full: 'Your health is already full.',
            downed: 'You cannot rest at zero HP. Another type of healing will be needed.',
            error: 'Could not confirm the rest. Retry safely: the same request will not be applied twice.'
          },
          health: {
            title: 'Character health',
            description: 'Actual values saved by the server, shared with your character.',
            loading: 'Loading health…',
            value: '{{current}} / {{maximum}} HP',
            baseMaxNote: 'Base maximum: Constitution × 10. Equipment bonuses do not affect gameplay HP yet.',
            notFound: 'You have not created a character yet.',
            create: 'Create character',
            unavailable: 'Unable to load character health from the server. Try again.',
            retry: 'Try again'
          },
          eyebrow: 'The game continues beyond the map',
          title: 'Your Refuge',
          description: 'Prepare your Vuxian, manage your belongings and train without entering the 2D world.',
          welcome: 'Welcome back, {{name}}',
          guest: 'You can train without an account. Inventory, personal portals and equipment require a VUXO session.',
          enterWorld: 'Explore the world',
          startTraining: 'Train with runes',
          requiresAccount: 'Sign-in required',
          availableWithoutAccount: 'No sign-in needed',
          open: 'Open',
          cards: {
            character: { title: 'Character', description: 'Appearance, attributes and preparation of your Vuxian.' },
            inventory: { title: 'Inventory and equipment', description: 'View earned items and equip relics and charms.' },
            portals: { title: 'Personal portals', description: 'Take on challenges assigned to your character, with results verified by the server.' },
            training: { title: 'Training', description: 'Try a rune memory minigame, even while the world is offline.' },
            reflex: { title: 'Rune reflexes', description: 'Train to find the right rune in eight quick rounds, even when the world is offline.' }
          },
          care: {
            title: 'Healing and rest',
            planned: 'Planned',
            description: 'Healing, consumable items and rest are planned. Current health and resources must be managed by the server: no healing is simulated here.'
          },
          reflex: {
            eyebrow: 'Free practice',
            title: 'Rune reflexes',
            description: 'Find the highlighted rune as quickly as you can. Eight rounds, no time limit, and everyone can take part.',
            disclaimer: 'Local practice only: no rewards, experience, items or saved results. Rewarded activities are verified by the server.',
            instructions: 'Select Start and find the shown rune for {{count}} rounds. Mistakes count, but you can keep trying.',
            start: 'Start',
            progress: 'Round {{current}} of {{total}}',
            find: 'Find this rune',
            choices: 'Available runes',
            mistakes: 'Mistakes: {{count}}',
            complete: 'Training complete!',
            hits: 'Hits: {{count}} / {{total}}',
            average: 'Average reaction: {{milliseconds}} ms',
            again: 'Play again',
            back: 'Back to Refuge'
          },          training: {
            eyebrow: 'Free practice',
            title: 'Rune memory',
            description: 'Remember the sequence, then repeat it in the right order. Practice as often as you like without entering the world.',
            disclaimer: 'Local practice only: no rewards, experience, items or saved results. Rewarded challenges are validated by the server.',
            difficulty: 'Difficulty',
            levels: { easy: 'Easy · 3 runes', standard: 'Standard · 4 runes', hard: 'Expert · 6 runes' },
            memorize: 'Remember these runes in the order shown.',
            ready: 'I’m ready',
            repeat: 'Repeat the rune sequence.',
            progress: 'Runes entered: {{count}} of {{total}}',
            clear: 'Clear sequence',
            check: 'Check',
            success: 'Great! Correct sequence.',
            failure: 'Not quite right. Try again!',
            accuracy: 'Correct positions: {{correct}} of {{total}}',
            duration: 'Response time: {{seconds}} s',
            again: 'New practice round',
            back: 'Back to Refuge'
          }
        },
        auth: {
          title: 'Sign in to Vuxo',
          description: 'Use Microsoft or Google. The provider confirms your identity, then Vuxo creates its own session for gameplay and realtime.',
          microsoft: 'Sign in with Microsoft',
          google: 'Sign in with Google',
          loadingProviders: 'Loading sign-in providers…',
          providersRetryHint: 'The sign-in service is not responding. You can try again without reloading the page.',
          retryProviders: 'Try again',
          loadingProvider: 'Loading Google sign-in',
          noProviders: 'No social sign-in provider is configured in this environment.',
          signingIn: 'Signing in…',
          signedIn: 'Vuxo session active',
          sessionExpiry: 'Session expires: {{date}}',
          continue: 'Continue to character',
          logout: 'Sign out',
          privacy: 'Vuxo does not use the provider token as a permanent identity: after verification it keeps only its own session.',
          genericError: 'Sign-in could not be completed.'
        },
        game: {
          guardian: {
            title: 'Guardian showdown',
            description: 'Optional PvE battle. Choose Strike or Guard: both cards are revealed and resolved by the server. This duel gives no rewards; the rune challenge still controls the portal prize.',
            descriptionV2: 'Tactical PvE showdown: choose Strike, Guard or Feint. The Guardian reveals its card after your choice; the server resolves the round without extra rewards.',
            feintHelp: 'Feint: breaks through Guard and deals extra damage if your Dexterity is high, but against Strike it deals no damage and you take 1 HP.',
            loading: 'Loading battle…',
            enemyHealth: 'Guardian: {{current}} / {{maximum}} HP',
            playerHealth: 'Your HP: {{current}} / {{maximum}}',
            turn: 'Turn {{turn}} / {{maximum}}',
            choose: 'Choose your card for the showdown:',
            cards: { strike: 'Strike', guard: 'Guard', feint: 'Feint' },
            turnResult: 'You: {{player}} · Guardian: {{enemy}}. Damage dealt: {{dealt}} HP; taken: {{taken}} HP.',
            outcomes: {
              victory: 'You defeated the Guardian! The portal reward is still earned by solving the rune challenge.',
              retreat: 'You retreated from the duel. Recover HP at the Refuge after the encounter.'
            },
            refuge: 'Visit Refuge',
            refresh: 'Refresh battle',
            retryTurn: 'Retry the same action',
            history: {
              title: 'Battle history',
              loading: 'Loading battle turns…',
              empty: 'No moves recorded in this encounter yet.',
              error: 'Could not load the battle history.',
              retry: 'Retry',
              entry: 'Turn {{turn}} · You: {{player}}, Guardian: {{enemy}} · Dealt {{dealt}} HP, taken {{taken}} HP · Guardian {{guardian}} HP, you {{health}} HP',
            },
            errors: {
              guardian_request_failed: 'Cannot confirm the battle. Retry safely without sending a new action.',
              guardian_unavailable: 'This duel requires a verified entry to the portal from the world.',
              guardian_stale_turn: 'The turn has already changed. Refresh the battle.',
              guardian_finished: 'This battle has ended. Refresh the battle.',
              guardian_too_injured: 'Your HP are too low to fight. Recover after the encounter.',
              guardian_idempotency_key_reused: 'This request was already used for a different card.',
              guardian_invalid_action: 'Invalid card.',
              guardian_invalid_turn: 'Invalid turn.',
              guardian_idempotency_key_required: 'Invalid action request key.'
            }
          },
          title: 'Shared world',
          description: 'Movement is server-authoritative. Use WASD, arrow keys or touch controls to send your movement intent.',
          playersOnline: 'Players online: {{count}}',
          portal: {
            available: 'Personal portals in the world: {{count}}',
            enter: 'Enter portal {{number}}',
            moveCloser: 'Move closer to a portal to enter. You can also select its marker on the map.',
            challenge: 'Portal challenge',
            genericError: 'Could not enter the portal.'
          },
          connection: {
            idle: 'Offline',
            connecting: 'Connecting…',
            connected: 'Online',
            reconnecting: 'Reconnecting…',
            disconnected: 'Disconnected',
            error: 'Error',
            genericError: 'The world connection is unavailable.'
          },
          controls: { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right' }
        },
        portals: {
          mistakeDamage: 'The portal dealt {{damage}} HP of damage. Health: {{current}}/{{maximum}}.',
          mistakeAlreadyRecorded: 'Further incorrect answers to this portal do not cause additional damage. Health: {{current}}/{{maximum}}.',
          visitRefuge: 'Visit Refuge',
          title: 'Portal challenges',
          description: 'Memorize the runes of personal portals and repeat them in the right order. The server validates your result.',
          authenticationRequired: 'Sign in to your Vuxo account to play portal challenges.',
          signIn: 'Sign in',
          loading: 'Loading portals…',
          available: 'Available portals',
          empty: 'You have no active challenge portals yet. A GameMaster can grant you a personal portal.',
          start: 'Start challenge',
          memoryTitle: 'Memory challenge',
          memorize: 'Remember this sequence. It will disappear shortly.',
          repeat: 'Repeat the four runes in the correct order.',
          progress: 'Runes selected: {{current}} / {{total}}',
          submit: 'Submit sequence',
          reset: 'Reset',
          showAgain: 'Show again',
          back: 'Back to portals',
          completed: 'Challenge complete! Your result has been saved.',
          awardReceived: 'Item earned: {{item}}. It is now in your inventory.',
          runes: { sun: 'Sun', moon: 'Moon', star: 'Star', wave: 'Wave' },
          errors: {
            portal_authentication_required: 'You must sign in to play.',
            portal_request_failed: 'The server could not be reached.',
            portal_challenge_not_available: 'This challenge is unavailable.',
            portal_challenge_required: 'Complete the challenge before using this portal.',
            portal_challenge_invalid_answer: 'That rune sequence is invalid.',
            portal_challenge_incorrect: 'Wrong sequence. Try again.',
            world_portal_not_joined: 'Join the shared world before entering this portal.',
            world_portal_too_far: 'You are too far from this portal. Move closer and try again.',
            encounter_already_active: 'Another portal encounter is already active. Complete it or wait for it to expire.',
            encounter_portal_unavailable: 'This portal is no longer available for an encounter.',
            encounter_character_required: 'Create a character before entering a portal.',
            exclusive_content_not_found: 'This portal is unavailable for your character.',
            exclusive_content_expired: 'This portal has expired.',
            exclusive_content_consumed: 'This challenge has already been completed.'
          }
        },
        inventory: {
          healing: {
            use: 'Use to heal (+10 HP)',
            retry: 'Retry item use',
            working: 'Healing…',
            success: 'Item consumed: +{{restored}} HP ({{current}}/{{maximum}}).',
            refuge: 'View health in Refuge',
            refreshError: 'Healing confirmed, but available stock could not be refreshed. Reload inventory.',
            encounterActive: 'A portal encounter is active. Use the Grove Seed after the challenge ends or the encounter expires.',
            refreshEncounter: 'Refresh encounter status'
          },
          title: 'Inventory',
          description: 'Items earned through personal challenges are securely stored on the server.',
          authenticationRequired: 'Sign in to your Vuxo account to see your inventory.',
          signIn: 'Sign in',
          loading: 'Loading inventory…',
          empty: 'You have no items yet. Complete a portal with an item reward to earn one.',
          owned: 'Items earned: {{count}}',
          consumed: 'Consumed',
          awardedAt: 'Earned on {{date}}',
          quantity: 'Quantity: {{count}}',
          stacksTitle: 'Item stacks',
          loadout: {
            title: 'Your equipment',
            description: 'Server-confirmed relic and charm slots. Choose what to wear from your available stacks.',
            loading: 'Synchronizing equipment…',
            refresh: 'Refresh equipment',
            empty: 'No item equipped',
            unknownItem: 'Equipped item',
            equipped: 'Equipped',
            slotEmpty: 'Empty slot',
            unequip: 'Unequip slot',
            replaceHint: 'To replace this item, unequip it from the slot first.',
            find: 'Find compatible items',
            healingNote: 'To consume a Grove Seed for healing, first unequip it from the Charm slot.',
            serverNote: 'Only the server confirms equipment and consumption. Browsing does not change items.'
          },
          browse: {
            title: 'Find your items',
            search: 'Search items',
            searchHint: 'Item name or key',
            slotLabel: 'Slot',
            slots: { all: 'All slots' },
            filterLabel: 'Show',
            sortLabel: 'Sort by',
            filters: { all: 'All', equipped: 'Equipped', available: 'Available' },
            sorts: { name: 'Name', quantity: 'Quantity (high to low)' },
            results: 'Entries shown: {{shown}} of {{total}}',
            noMatches: 'No items match these filters. Your items have not been removed.',
            clear: 'Clear filters'
          },          stackQuantity: 'Owned copies: {{count}}',
          equippedQuantity: 'Equipped: {{count}}',
          equip: 'Equip',
          unequip: 'Unequip',
          slots: { relic: 'Relic', charm: 'Charm' },
          effectiveStats: 'Equipment-adjusted stats',
          statsPreviewNote: 'Equipment preview only. Bonuses do not change base allocation or live multiplayer movement yet.',
          maxHealth: 'Projected maximum health: {{value}}',
          stats: {
            strength: 'Strength: {{value}} (+{{bonus}})',
            dexterity: 'Dexterity: {{value}} (+{{bonus}})',
            intelligence: 'Intelligence: {{value}} (+{{bonus}})',
            constitution: 'Constitution: {{value}} (+{{bonus}})',
            luck: 'Luck: {{value}} (+{{bonus}})',
            faith: 'Faith: {{value}} (+{{bonus}})'
          },
          items: {
            runeShard: 'Rune Shard',
            groveSeed: 'Grove Seed',
            tidalPearl: 'Tidal Pearl'
          },
          errors: {
            inventory_authentication_required: 'Sign in to see your inventory.',
            inventory_request_failed: 'Unable to load inventory. Please try again.',
            equipment_item_not_owned: 'This item does not belong to your inventory.',
            equipment_item_not_equippable: 'This item cannot be equipped.',
            equipment_item_already_equipped: 'This item is already equipped.',
            equipment_slot_occupied: 'Slot occupied. Unequip its current item first.',
            equipment_character_required: 'Create a character before equipping an item.',
            equipment_invalid_slot: 'Invalid equipment slot.',
            equipment_slot_empty: 'This slot is already empty.',
            equipment_conflict: 'Equipment changed during another request. Reload the page.',
            heal_request_failed: 'Could not confirm healing. Retry safely: the same item will not be consumed twice.',
            heal_idempotency_key_required: 'Invalid healing request key.',
            heal_idempotency_key_reused: 'Request already used for a different item.',
            heal_item_not_owned: 'You do not own this item.',
            heal_item_not_consumable: 'This item cannot heal.',
            heal_item_equipped: 'Unequip the Grove Seed charm first.',
            heal_conflict: 'Another request changed this item. Refresh your inventory.',
            heal_item_used: 'This item has already been consumed.',
            heal_encounter_active: 'You cannot heal during an active portal encounter.',
            heal_already_full: 'Your health is already full.',
            heal_unavailable: 'You cannot use this item at zero HP.',
            character_not_found: 'Create a character before healing.'
          }
        },
        admin: { title: 'Administration', description: 'Health, online players, event audit, exclusive content and telemetry will live here.' },
        version: {
          title: 'Version and build',
          description: 'Identify the loaded frontend build and the backend it is connected to.',
          frontend: 'Frontend',
          backend: 'Backend',
          application: 'Application',
          version: 'Version',
          commit: 'Commit',
          buildUtc: 'Build UTC',
          informationalVersion: 'Informational version',
          environment: 'Environment',
          unknown: 'unknown',
          unavailable: 'unavailable',
          frontendUnavailable: 'Frontend build metadata is unavailable.',
          backendUnavailable: 'Backend build metadata is unavailable.',
          update: { available: 'A new Vuxo build is available ({{version}}).', reload: 'Reload' }
        },
        character: {
          editor: {
            eyebrow: 'Character creation',
            title: 'Build your Vuxian',
            description: 'Choose an initial look, distribute the 10 points and preview derived stats immediately. Final rules are always validated by the server.',
            loading: 'Loading appearance catalog…',
            catalogError: 'The character catalog is unavailable. Try again when the Vuxo API is reachable.',
            authenticationRequired: 'You can prepare and keep the choices locally, but an authenticated Vuxo session is required to create the character.',
            identity: 'Identity and attributes',
            name: 'Name',
            attributes: 'Attributes',
            points: '{{used}} / {{total}} points assigned',
            appearance: 'Appearance',
            catalogVersion: 'Appearance catalog {{version}}',
            create: 'Create character',
            saving: 'Creating…',
            created: 'Character created. The server saved your choices.',
            saveFailed: 'The character could not be created.'
          },
          stats: { maxHealth: 'Maximum health', speed: 'Speed' },
          attributes: {
            strength: 'Strength', dexterity: 'Dexterity', intelligence: 'Intelligence', constitution: 'Constitution', luck: 'Luck', faith: 'Faith'
          },
          appearance: {
            hairStyle: 'Hair', hairColor: 'Hair color', face: 'Face', bodyType: 'Body type', skinTone: 'Skin tone',
            topColor: 'Top color', bottomStyle: 'Bottom', bottomColor: 'Bottom color', shoeStyle: 'Shoes', shoeColor: 'Shoe color'
          },
          options: {
            hairStyle: { 'hair-1': 'Short', 'hair-2': 'Medium', 'hair-3': 'Long', 'hair-4': 'Curly' },
            face: { 'face-1': 'Soft', 'face-2': 'Angular', 'face-3': 'Round' },
            bodyType: { 'body-1': 'Slim', 'body-2': 'Average', 'body-3': 'Broad' },
            skinTone: { 'skin-1': 'Tone 1', 'skin-2': 'Tone 2', 'skin-3': 'Tone 3', 'skin-4': 'Tone 4', 'skin-5': 'Tone 5' },
            bottomStyle: { shorts: 'Shorts', skirt: 'Skirt' },
            shoeStyle: { 'shoe-1': 'Sneakers', 'shoe-2': 'Boots', 'shoe-3': 'Low shoes' },
            color: { black: 'Black', brown: 'Brown', blonde: 'Blonde', red: 'Red', blue: 'Blue', green: 'Green', white: 'White' }
          }
        },
        errors: {
          social_provider_configuration_unavailable: 'Sign-in provider configuration is unavailable.',
          social_provider_invalid: 'Invalid sign-in provider.',
          social_provider_not_configured: 'This provider is not configured on the Vuxo server.',
          social_credential_invalid: 'The provider credential is invalid.',
          social_credential_expired: 'The provider credential has expired. Sign in again.',
          social_credential_audience_invalid: 'The credential was issued for a different application.',
          social_provider_unavailable: 'The sign-in provider is unavailable. Try again.',
          social_login_cancelled: 'Sign-in was cancelled or not completed.',
          social_login_failed: 'Social sign-in could not be completed.',
          social_logout_failed: 'The server could not be reached while signing out.',
          character_name_required: 'Enter a name.',
          character_name_length_invalid: 'The name must be between 3 and 24 characters.',
          character_attributes_negative: 'Attributes cannot be negative.',
          character_attribute_allocation_invalid: 'You must assign exactly 10 points.',
          character_appearance_required: 'Choose a character appearance.',
          character_appearance_option_invalid: 'An appearance choice is no longer valid. Reload the catalog.',
          character_already_exists: 'This account already owns a character.',
          world_authentication_required: 'Sign in to Vuxo before entering the shared world.',
          world_character_required: 'Create a Vuxo character first.',
          world_connection_failed: 'Could not connect to the world.',
          world_reconnect_failed: 'Could not reconnect to the world.',
          world_session_replaced: 'This session was replaced by a newer connection.',
          world_input_rejected: 'The server rejected a movement input.'
        }
      }
    }
  },
  lng: initialLanguage,
  fallbackLng: 'it',
  supportedLngs: ['it', 'en'],
  interpolation: { escapeValue: false }
});

function normalizeLanguage(language: string | undefined): SupportedLanguage {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'it';
}

function synchronizeLanguage(language: string | undefined): void {
  const normalized = normalizeLanguage(language);
  writeLanguagePreference(normalized);
  document.documentElement.lang = normalized;
}

void initialization.then(() => synchronizeLanguage(i18n.resolvedLanguage));
i18n.on('languageChanged', language => synchronizeLanguage(language));

export { i18n };
