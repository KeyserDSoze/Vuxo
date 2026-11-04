import { i18n } from '../i18n';

export const vuxoI18nNamespaces = [
  'common',
  'auth',
  'character',
  'game',
  'portals',
  'admin',
  'errors',
] as const;

type TranslationRoot = Record<string, unknown>;

function registerNamespaces(): void {
  for (const language of ['it', 'en'] as const) {
    const translation = i18n.getResourceBundle(language, 'translation') as TranslationRoot | undefined;
    if (!translation) continue;

    i18n.addResourceBundle(language, 'common', {
      nav: translation.nav,
      shell: translation.shell,
      theme: translation.theme,
      home: translation.home,
      version: translation.version,
    }, true, true);

    for (const namespace of ['auth', 'character', 'game', 'portals', 'errors'] as const) {
      const bundle = translation[namespace];
      if (bundle) i18n.addResourceBundle(language, namespace, bundle, true, true);
    }
  }
}

if (i18n.isInitialized) {
  registerNamespaces();
} else {
  i18n.on('initialized', registerNamespaces);
}
