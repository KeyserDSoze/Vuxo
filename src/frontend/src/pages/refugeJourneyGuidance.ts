import type { CharacterHealth } from '../features/health/characterHealthApi';
import type { PortalEncounterStatus } from '../features/health/portalEncounterApi';
import type { EquipmentView } from '../features/inventory/equipmentApi';

export type JourneyStepKey = 'health' | 'equipment' | 'encounter';
export type JourneyStepAction = 'reviewHealth' | 'character' | 'training' | 'inventory' | 'portals' | 'refresh';
export type JourneyStepTone = 'positive' | 'caution' | 'unknown';

export type JourneyStep = {
  key: JourneyStepKey;
  state: string;
  tone: JourneyStepTone;
  action: JourneyStepAction;
};

type GuideData = {
  health: CharacterHealth;
  equipment: EquipmentView | null;
  encounter: PortalEncounterStatus | null;
};

/**
 * Advisory navigation, not a combat eligibility check.
 * All values come from existing owner-scoped read models; no progress or
 * "ready" status is persisted, inferred or used to authorize an action.
 */
export function deriveJourneySteps({ health, equipment, encounter }: GuideData): JourneyStep[] {
  const healthStep: JourneyStep = health.currentHealth <= 0
    ? { key: 'health', state: 'down', tone: 'caution', action: 'character' }
    : health.currentHealth < health.maxHealth
      ? { key: 'health', state: 'recover', tone: 'caution', action: 'reviewHealth' }
      : { key: 'health', state: 'full', tone: 'positive', action: 'training' };

  let equipmentStep: JourneyStep;
  if (!equipment) {
    equipmentStep = { key: 'equipment', state: 'unknown', tone: 'unknown', action: 'refresh' };
  } else {
    const occupied = (['relic', 'charm'] as const)
      .filter(slot => equipment.items.some(item => item.slot === slot)).length;
    equipmentStep = occupied === 0
      ? { key: 'equipment', state: 'empty', tone: 'caution', action: 'inventory' }
      : occupied === 1
        ? { key: 'equipment', state: 'partial', tone: 'caution', action: 'inventory' }
        : { key: 'equipment', state: 'equipped', tone: 'positive', action: 'inventory' };
  }

  const encounterStep: JourneyStep = !encounter
    ? { key: 'encounter', state: 'unknown', tone: 'unknown', action: 'refresh' }
    : encounter.active
      ? { key: 'encounter', state: 'active', tone: 'caution', action: 'portals' }
      : { key: 'encounter', state: 'idle', tone: 'positive', action: 'portals' };

  return [healthStep, equipmentStep, encounterStep];
}
