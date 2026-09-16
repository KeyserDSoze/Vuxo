import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'vuxo.language';
const storedLanguage = localStorage.getItem(STORAGE_KEY);
const browserLanguage = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'it';

void i18n.use(initReactI18next).init({
  resources: {
    it: {
      translation: {
        nav: { home: 'Home', character: 'Personaggio', game: 'Gioco', admin: 'Admin', version: 'Versione' },
        shell: { theme: 'Tema', language: 'Lingua', version: 'Versione {{version}}' },
        theme: { system: 'Sistema', light: 'Chiaro', dark: 'Scuro' },
        home: {
          eyebrow: 'Versione 0.0.1 · First playable',
          title: 'Il primo mondo di Vuxo sta nascendo.',
          description: 'Esplora un mondo 2D condiviso, crea il tuo personaggio e preparati a un universo che cresce insieme ai giocatori.',
          cta: 'Entra nel prototipo'
        },
        game: {
          title: 'Mondo condiviso',
          description: 'Il movimento è autoritativo lato server. Usa WASD, le frecce o i controlli touch per inviare i tuoi intenti.',
          playersOnline: 'Giocatori online: {{count}}',
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
        admin: { title: 'Amministrazione', description: 'Health, giocatori online, audit degli eventi, contenuti esclusivi e telemetria saranno raccolti qui.' },
        version: { title: 'Versione', frontend: 'Frontend', commit: 'Commit', buildUtc: 'Build UTC', unknown: 'sconosciuto' },
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
        nav: { home: 'Home', character: 'Character', game: 'Game', admin: 'Admin', version: 'Version' },
        shell: { theme: 'Theme', language: 'Language', version: 'Version {{version}}' },
        theme: { system: 'System', light: 'Light', dark: 'Dark' },
        home: {
          eyebrow: 'Version 0.0.1 · First playable',
          title: 'The first world of Vuxo is coming to life.',
          description: 'Explore a shared 2D world, create your character and get ready for a universe that grows together with its players.',
          cta: 'Enter the prototype'
        },
        game: {
          title: 'Shared world',
          description: 'Movement is server-authoritative. Use WASD, arrow keys or touch controls to send your movement intent.',
          playersOnline: 'Players online: {{count}}',
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
        admin: { title: 'Administration', description: 'Health, online players, event audit, exclusive content and telemetry will live here.' },
        version: { title: 'Version', frontend: 'Frontend', commit: 'Commit', buildUtc: 'Build UTC', unknown: 'unknown' },
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
  lng: storedLanguage ?? browserLanguage,
  fallbackLng: 'it',
  supportedLngs: ['it', 'en'],
  interpolation: { escapeValue: false }
});

i18n.on('languageChanged', language => localStorage.setItem(STORAGE_KEY, language));

export { i18n };
