export const CHARACTER_NAME_MIN_LENGTH = 3
export const CHARACTER_NAME_MAX_LENGTH = 24
export const CHARACTER_ALLOCATION_POINTS = 10

export type CharacterAttributesDraft = {
  strength: number
  dexterity: number
  intelligence: number
  constitution: number
  luck: number
  faith: number
}

export type CharacterDraftErrorCode =
  | 'character_name_required'
  | 'character_name_length_invalid'
  | 'character_attributes_negative'
  | 'character_attribute_allocation_invalid'

/**
 * Client-side validation exists only to provide immediate UX feedback.
 * The backend remains authoritative and must validate every rule again.
 */
export function validateCharacterDraft(
  name: string,
  attributes: CharacterAttributesDraft,
): CharacterDraftErrorCode[] {
  const errors: CharacterDraftErrorCode[] = []
  const trimmedName = name.trim()

  if (trimmedName.length === 0) {
    errors.push('character_name_required')
  } else if (
    trimmedName.length < CHARACTER_NAME_MIN_LENGTH ||
    trimmedName.length > CHARACTER_NAME_MAX_LENGTH
  ) {
    errors.push('character_name_length_invalid')
  }

  const values = Object.values(attributes)
  if (values.some((value) => value < 0)) {
    errors.push('character_attributes_negative')
  }

  if (values.reduce((sum, value) => sum + value, 0) !== CHARACTER_ALLOCATION_POINTS) {
    errors.push('character_attribute_allocation_invalid')
  }

  return errors
}

export function getCharacterMaxHealth(constitution: number): number {
  return constitution * 10
}

export function getCharacterMovementSpeedMultiplier(dexterity: number): number {
  return 1 + dexterity * 0.1
}
