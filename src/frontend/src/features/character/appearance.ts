export type CharacterAppearanceDraft = {
  hairStyle: string
  hairColor: string
  face: string
  bodyType: string
  skinTone: string
  topColor: string
  bottomStyle: string
  bottomColor: string
  shoeStyle: string
  shoeColor: string
}

export type CharacterAppearanceCatalog = {
  catalogVersion: string
  hairStyles: string[]
  hairColors: string[]
  faces: string[]
  bodyTypes: string[]
  skinTones: string[]
  topColors: string[]
  bottomStyles: string[]
  bottomColors: string[]
  shoeStyles: string[]
  shoeColors: string[]
}

export const DEFAULT_APPEARANCE: CharacterAppearanceDraft = {
  hairStyle: 'hair-1',
  hairColor: 'black',
  face: 'face-1',
  bodyType: 'body-1',
  skinTone: 'skin-1',
  topColor: 'blue',
  bottomStyle: 'shorts',
  bottomColor: 'black',
  shoeStyle: 'shoe-1',
  shoeColor: 'white',
}

export const PREVIEW_COLORS: Record<string, string> = {
  black: '#20242c',
  brown: '#704b35',
  blonde: '#d9b85f',
  red: '#a94c3b',
  blue: '#3f6fd8',
  green: '#4b8b62',
  white: '#e9edf3',
  'skin-1': '#f5d0b5',
  'skin-2': '#e8b18e',
  'skin-3': '#c98963',
  'skin-4': '#966044',
  'skin-5': '#603c2f',
}

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
}

export async function fetchAppearanceCatalog(signal?: AbortSignal): Promise<CharacterAppearanceCatalog> {
  const response = await fetch(`${getApiBaseUrl()}/api/meta/character-appearance`, { signal })
  if (!response.ok) throw new Error(`appearance_catalog_${response.status}`)
  return response.json() as Promise<CharacterAppearanceCatalog>
}

export function normalizeAppearance(
  appearance: CharacterAppearanceDraft,
  catalog: CharacterAppearanceCatalog,
): CharacterAppearanceDraft {
  const pick = (current: string, values: string[]) => values.includes(current) ? current : values[0] ?? current
  return {
    hairStyle: pick(appearance.hairStyle, catalog.hairStyles),
    hairColor: pick(appearance.hairColor, catalog.hairColors),
    face: pick(appearance.face, catalog.faces),
    bodyType: pick(appearance.bodyType, catalog.bodyTypes),
    skinTone: pick(appearance.skinTone, catalog.skinTones),
    topColor: pick(appearance.topColor, catalog.topColors),
    bottomStyle: pick(appearance.bottomStyle, catalog.bottomStyles),
    bottomColor: pick(appearance.bottomColor, catalog.bottomColors),
    shoeStyle: pick(appearance.shoeStyle, catalog.shoeStyles),
    shoeColor: pick(appearance.shoeColor, catalog.shoeColors),
  }
}
