import type { CharacterAppearanceDraft } from '../features/character/appearance'
import type { WorldCharacterAppearance } from '../features/world/worldRealtime'

export const SUPPORTED_WORLD_APPEARANCE_CATALOG = '0.0.1'

const choices: Record<keyof CharacterAppearanceDraft, readonly string[]> = {
  hairStyle: ['hair-1', 'hair-2', 'hair-3', 'hair-4'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'blue'],
  face: ['face-1', 'face-2', 'face-3'],
  bodyType: ['body-1', 'body-2', 'body-3'],
  skinTone: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
  topColor: ['blue', 'red', 'green', 'black', 'white'],
  bottomStyle: ['shorts', 'skirt'],
  bottomColor: ['black', 'blue', 'red', 'green', 'white'],
  shoeStyle: ['shoe-1', 'shoe-2', 'shoe-3'],
  shoeColor: ['white', 'black', 'brown', 'red', 'blue'],
}

// Old server versions have no appearance; unknown future catalog versions
// intentionally render the stable legacy wanderer instead of guessing.
export function readWorldAppearance(source: WorldCharacterAppearance | null | undefined): CharacterAppearanceDraft | null {
  if (!source || source.catalogVersion !== SUPPORTED_WORLD_APPEARANCE_CATALOG) return null
  const result = {} as CharacterAppearanceDraft
  for (const key of Object.keys(choices) as Array<keyof CharacterAppearanceDraft>) {
    if (!choices[key].includes(source[key])) return null
    result[key] = source[key]
  }
  return result
}

export function worldAppearanceKey(value: CharacterAppearanceDraft | null): string {
  if (!value) return 'legacy'
  // Object key order is stable because readWorldAppearance uses choices order.
  return JSON.stringify(value)
}
