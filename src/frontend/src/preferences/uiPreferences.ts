export type SupportedLanguage = 'it' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';

const LANGUAGE_KEY = 'vuxo.language';
const THEME_KEY = 'vuxo.theme';
const AUDIO_KEY = 'vuxo.audio';

/** Sound is on unless the player explicitly turned it off. */
export function readAudioPreference(): boolean {
  try {
    return localStorage.getItem(AUDIO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeAudioPreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUDIO_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private mode: the preference simply does not persist.
  }
}

export function readLanguagePreference(browserLanguage: string): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === 'it' || stored === 'en') return stored;
  if (stored !== null) return 'it';
  return browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'it';
}

export function writeLanguagePreference(language: SupportedLanguage): void {
  localStorage.setItem(LANGUAGE_KEY, language);
}

export function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function writeThemePreference(theme: ThemePreference): void {
  localStorage.setItem(THEME_KEY, theme);
}

export function readUiPreferences(browserLanguage: string): {
  language: SupportedLanguage;
  theme: ThemePreference;
} {
  return {
    language: readLanguagePreference(browserLanguage),
    theme: readThemePreference(),
  };
}
