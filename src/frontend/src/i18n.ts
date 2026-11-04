import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readLanguagePreference, writeLanguagePreference, type SupportedLanguage } from './preferences/uiPreferences';

const initialLanguage = readLanguagePreference(navigator.language);

const initialization = i18n.use(initReactI18next).init({
  resources: {
    it: {
      translation: {
        nav: { home: 'Home', auth: 'Account', character: 'Personaggio', game: 'Gioco', portals: 'Portali', inventory: 'Inventario', admin: 'Admin', version: 'Versione' },
        shell: { theme: 'Tema', language: 'Lingua', navigation: 'Navigazione principale', openMenu: 'Apri menu', closeMenu: 'Chiudi', version: 'Versione {{version}}' },
        theme: { system: 'Sistema', light: 'Chiaro', dark: 'Scuro' },
        home: {
          eyebrow: 'Versione {{version}} · First playable',
          title: 'Il primo mondo di Vuxo sta nascendo.',
          description: 'Esplora un mondo 2D condiviso, crea il tuo personaggio e preparati a un universo che cresce insieme ai giocatori.',
          cta: 'Entra nel prototipo',
          ctaSignIn: 'Accedi per iniziare',
          ctaCharacter: 'Crea il personaggio',
          features: {
            character: { title: 'Il tuo Vuxian', description: 'Crea un personaggio unico e scegli gli attributi che lo definiscono.' },
            world: { title: 'Un mondo condiviso', description: 'Esplora un mondo 2D in compagnia di altri giocatori.' },
            portals: { title: 'Portali e sfide', description: 'Scopri nuovi portali e affronta prove personali.' }
          }
        },
        auth: {
          title: 'Accedi a Vuxo',
          description: 'Usa Microsoft o Google. Il provider conferma la tua identità, poi Vuxo crea una sessione propria per gioco e realtime.',
          microsoft: 'Accedi con Microsoft',
          google: 'Accedi con Google',
          loadingProviders: 'Caricamento provider di accesso…',
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
            exclusive_content_not_found: 'Questo portale non è disponibile per il tuo personaggio.',
            exclusive_content_expired: 'Questo portale è scaduto.',
            exclusive_content_consumed: 'Questa sfida è già stata completata.'
          }
        },
        inventory: {
          title: 'Inventario',
          description: 'Gli oggetti ottenuti superando le sfide personali sono salvati sul server.',
          authenticationRequired: 'Accedi al tuo account Vuxo per consultare il tuo inventario.',
          signIn: 'Accedi',
          loading: 'Caricamento inventario…',
          empty: 'Non hai ancora oggetti. Completa un portale con una ricompensa per ottenerne uno.',
          owned: 'Oggetti ottenuti: {{count}}',
          awardedAt: 'Ottenuto il {{date}}',
          quantity: 'Quantità: {{count}}',
          stacksTitle: 'Pile di oggetti',
          stackQuantity: 'Copie possedute: {{count}}',
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
            equipment_conflict: 'Equipaggiamento modificato da un’altra richiesta. Ricarica la pagina.'
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
        nav: { home: 'Home', auth: 'Account', character: 'Character', game: 'Game', portals: 'Portals', inventory: 'Inventory', admin: 'Admin', version: 'Version' },
        shell: { theme: 'Theme', language: 'Language', navigation: 'Main navigation', openMenu: 'Open menu', closeMenu: 'Close', version: 'Version {{version}}' },
        theme: { system: 'System', light: 'Light', dark: 'Dark' },
        home: {
          eyebrow: 'Version {{version}} · First playable',
          title: 'The first world of Vuxo is coming to life.',
          description: 'Explore a shared 2D world, create your character and get ready for a universe that grows together with its players.',
          cta: 'Enter the prototype',
          ctaSignIn: 'Sign in to get started',
          ctaCharacter: 'Create your character',
          features: {
            character: { title: 'Your Vuxian', description: 'Create a unique character and choose the attributes that define them.' },
            world: { title: 'A shared world', description: 'Explore a 2D world alongside other players.' },
            portals: { title: 'Portals and challenges', description: 'Discover new portals and take on personal challenges.' }
          }
        },
        auth: {
          title: 'Sign in to Vuxo',
          description: 'Use Microsoft or Google. The provider confirms your identity, then Vuxo creates its own session for gameplay and realtime.',
          microsoft: 'Sign in with Microsoft',
          google: 'Sign in with Google',
          loadingProviders: 'Loading sign-in providers…',
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
            exclusive_content_not_found: 'This portal is unavailable for your character.',
            exclusive_content_expired: 'This portal has expired.',
            exclusive_content_consumed: 'This challenge has already been completed.'
          }
        },
        inventory: {
          title: 'Inventory',
          description: 'Items earned through personal challenges are securely stored on the server.',
          authenticationRequired: 'Sign in to your Vuxo account to see your inventory.',
          signIn: 'Sign in',
          loading: 'Loading inventory…',
          empty: 'You have no items yet. Complete a portal with an item reward to earn one.',
          owned: 'Items earned: {{count}}',
          awardedAt: 'Earned on {{date}}',
          quantity: 'Quantity: {{count}}',
          stacksTitle: 'Item stacks',
          stackQuantity: 'Owned copies: {{count}}',
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
            equipment_conflict: 'Equipment changed during another request. Reload the page.'
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
