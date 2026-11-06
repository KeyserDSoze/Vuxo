/**
 * Runtime checks for owner-scoped read models. These guards are advisory UI
 * safety nets: the server alone grants items, changes HP or resolves combat.
 * The module has no browser dependencies, so Node can test it offline.
 */
export type InventoryAward = {
  grantId: string; itemKey: string; quantity: number;
  awardedAtUtc: string; consumed?: boolean;
};
export type InventoryStack = {
  itemKey: string; quantity: number; equippedQuantity: number;
  availableGrantIds: string[];
};
export type EquipmentItem = {
  slot: 'relic' | 'charm'; grantId: string; itemKey: string; equippedAtUtc: string;
};
export type EffectiveEquipmentStats = {
  strength: number; dexterity: number; intelligence: number;
  constitution: number; luck: number; faith: number;
  maxHealth: number; movementSpeedMultiplier: number;
  bonuses: {
    strength: number; dexterity: number; intelligence: number;
    constitution: number; luck: number; faith: number;
  };
};
export type EquipmentView = {
  items: EquipmentItem[]; stats: EffectiveEquipmentStats | null; ruleVersion: string;
};
export type CharacterHealth = {
  name: string; currentHealth: number; maxHealth: number; rulesVersion: string;
};
export type PortalEncounterStatus = {
  active: boolean; portalGrantId: string | null; expiresAtUtc: string | null;
};

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statKeys = ['strength', 'dexterity', 'intelligence', 'constitution', 'luck', 'faith'] as const;
function bad(code: string): never { throw new Error(code); }
function object(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return bad(code);
  return value as Record<string, unknown>;
}
function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) return bad(code);
  return value;
}
function guid(value: unknown, code: string): string {
  const result = text(value, code);
  if (!guidPattern.test(result)) return bad(code);
  return result;
}
function date(value: unknown, code: string): string {
  const result = text(value, code);
  if (!Number.isFinite(Date.parse(result))) return bad(code);
  return result;
}
function integer(value: unknown, code: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) return bad(code);
  return value;
}
function finite(value: unknown, code: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) return bad(code);
  return value;
}
function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) return bad(code);
  return value;
}
function noDuplicates(values: string[], code: string): void {
  if (new Set(values).size !== values.length) bad(code);
}

export function parsePlayerInventory(value: unknown): InventoryAward[] {
  const code = 'inventory_invalid_response';
  const awards = array(value, code).map(raw => {
    const row = object(raw, code);
    if (row.consumed !== undefined && typeof row.consumed !== 'boolean') bad(code);
    return {
      grantId: guid(row.grantId, code), itemKey: text(row.itemKey, code),
      quantity: integer(row.quantity, code, 1),
      awardedAtUtc: date(row.awardedAtUtc, code),
      ...(row.consumed === undefined ? {} : { consumed: row.consumed as boolean }),
    };
  });
  noDuplicates(awards.map(item => item.grantId), code);
  return awards;
}

export function parseInventoryStacks(value: unknown): InventoryStack[] {
  const code = 'inventory_invalid_response';
  const allGrants: string[] = [];
  const stacks = array(value, code).map(raw => {
    const row = object(raw, code);
    const quantity = integer(row.quantity, code, 1);
    const equippedQuantity = integer(row.equippedQuantity, code);
    const availableGrantIds = array(row.availableGrantIds, code).map(id => guid(id, code));
    if (equippedQuantity > quantity || availableGrantIds.length > quantity - equippedQuantity) bad(code);
    allGrants.push(...availableGrantIds);
    return { itemKey: text(row.itemKey, code), quantity, equippedQuantity, availableGrantIds };
  });
  noDuplicates(stacks.map(stack => stack.itemKey), code);
  noDuplicates(allGrants, code);
  return stacks;
}

export function parseEquipmentView(value: unknown): EquipmentView {
  const code = 'equipment_invalid_response';
  const model = object(value, code);
  const items = array(model.items, code).map(raw => {
    const row = object(raw, code);
    if (row.slot !== 'relic' && row.slot !== 'charm') return bad(code);
    return {
      slot: row.slot as EquipmentItem['slot'], grantId: guid(row.grantId, code),
      itemKey: text(row.itemKey, code), equippedAtUtc: date(row.equippedAtUtc, code),
    };
  });
  noDuplicates(items.map(item => item.slot), code);
  noDuplicates(items.map(item => item.grantId), code);
  let stats: EffectiveEquipmentStats | null = null;
  if (model.stats !== null) {
    const values = object(model.stats, code);
    const bonuses = object(values.bonuses, code);
    const parsed = {} as Record<(typeof statKeys)[number], number>;
    const parsedBonuses = {} as Record<(typeof statKeys)[number], number>;
    for (const key of statKeys) {
      parsed[key] = integer(values[key], code);
      parsedBonuses[key] = integer(bonuses[key], code);
    }
    stats = {
      ...parsed, bonuses: parsedBonuses,
      maxHealth: integer(values.maxHealth, code, 1),
      movementSpeedMultiplier: finite(values.movementSpeedMultiplier, code, Number.EPSILON),
    };
  }
  return { items, stats, ruleVersion: text(model.ruleVersion, code) };
}

export function parseCharacterHealth(value: unknown): CharacterHealth {
  const code = 'health_invalid_response';
  const model = object(value, code);
  const maxHealth = integer(model.maxHealth, code, 1);
  const currentHealth = integer(model.currentHealth, code);
  if (currentHealth > maxHealth) return bad(code);
  return {
    name: text(model.name, code), currentHealth, maxHealth,
    rulesVersion: text(model.rulesVersion, code),
  };
}

export function parsePortalEncounterStatus(value: unknown): PortalEncounterStatus {
  const code = 'encounter_status_invalid_response';
  const model = object(value, code);
  if (typeof model.active !== 'boolean') return bad(code);
  if (!model.active) {
    if (model.portalGrantId != null || model.expiresAtUtc != null) return bad(code);
    return { active: false, portalGrantId: null, expiresAtUtc: null };
  }
  return {
    active: true,
    portalGrantId: guid(model.portalGrantId, code),
    expiresAtUtc: date(model.expiresAtUtc, code),
  };
}
