// Mirrors docs/legal/asset-licenses.md: every third-party file shipped in the
// frontend must appear in both places (AGENTS.md, issue #246).
export type CreditEntry = {
  id: string;
  pack: string;
  author: string;
  license: 'CC0-1.0' | 'CC-BY-4.0';
  sourceUrl: string;
  /** i18n key (under `credits.entries`) describing what the pack is used for. */
  usageKey: 'kenneyRpgPack';
};

export const creditEntries: readonly CreditEntry[] = [
  {
    id: 'kenney-rpg-pack',
    pack: 'RPG Pack (art + audio)',
    author: 'Kenney (kenney.nl)',
    license: 'CC0-1.0',
    sourceUrl: 'https://kenney.nl/assets/rpg-base-pack',
    usageKey: 'kenneyRpgPack',
  },
];

export const licenseUrls: Record<CreditEntry['license'], string> = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
};
