export type SupportedLanguage = 'it' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';

const LANGUAGE_KEY = 'vuxo.language';
const THEME_KEY = 'vuxo.theme';

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
