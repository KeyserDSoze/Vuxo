import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'vuxo.language';
const storedLanguage = localStorage.getItem(STORAGE_KEY);
const browserLanguage = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'it';

void i18n.use(initReactI18next).init({
  resources: {
    it: {
      translation: {
        nav: { home: 'Home', game: 'Gioco', admin: 'Admin', version: 'Versione' },
        shell: { theme: 'Tema', language: 'Lingua', version: 'Versione {{version}}' },
        theme: { system: 'Sistema', light: 'Chiaro', dark: 'Scuro' },
        home: {
          eyebrow: 'Versione 0.0.1 · First playable',
          title: 'Il primo mondo di Vuxo sta nascendo.',
          description: 'Esplora un mondo 2D condiviso, crea il tuo personaggio e preparati a un universo che cresce insieme ai giocatori.',
          cta: 'Entra nel prototipo'
        },
        game: { title: 'Prototipo del mondo', description: 'Placeholder originale generato da codice. Usa WASD o le frecce per muoverti.' },
        admin: { title: 'Amministrazione', description: 'Health, giocatori online, audit degli eventi, contenuti esclusivi e telemetria saranno raccolti qui.' },
        version: { title: 'Versione', frontend: 'Frontend', commit: 'Commit', buildUtc: 'Build UTC', unknown: 'sconosciuto' }
      }
    },
    en: {
      translation: {
        nav: { home: 'Home', game: 'Game', admin: 'Admin', version: 'Version' },
        shell: { theme: 'Theme', language: 'Language', version: 'Version {{version}}' },
        theme: { system: 'System', light: 'Light', dark: 'Dark' },
        home: {
          eyebrow: 'Version 0.0.1 · First playable',
          title: 'The first world of Vuxo is coming to life.',
          description: 'Explore a shared 2D world, create your character and get ready for a universe that grows together with its players.',
          cta: 'Enter the prototype'
        },
        game: { title: 'World prototype', description: 'Original code-generated placeholder. Use WASD or arrow keys to move.' },
        admin: { title: 'Administration', description: 'Health, online players, event audit, exclusive content and telemetry will live here.' },
        version: { title: 'Version', frontend: 'Frontend', commit: 'Commit', buildUtc: 'Build UTC', unknown: 'unknown' }
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
