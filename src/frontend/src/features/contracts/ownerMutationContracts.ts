import { isValidServerTimestamp } from './serverTimestamp.ts';

/**
 * Client-side validation of server-authoritative HP mutations. Never compute
 * healing amounts or grant outcomes in the browser. A malformed successful
 * response is ambiguous: the original idempotency key must be reused on retry.
 */
export type CharacterRestResult = {
  idempotencyKey: string;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
  restoredHealth: number;
  restedAtUtc: string;
  nextRestAtUtc: string;
  replayed: boolean;
};

export type CharacterItemHealResult = {
  grantId: string;
  idempotencyKey: string;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
  restoredHealth: number;
  consumedAtUtc: string;
  replayed: boolean;
};

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(kind: 'rest' | 'heal'): never {
  throw new Error(kind === 'rest' ? 'rest_invalid_response' : 'heal_invalid_response');
}
function record(value: unknown, kind: 'rest' | 'heal'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(kind);
  return value as Record<string, unknown>;
}
function guid(value: unknown, kind: 'rest' | 'heal'): string {
  if (typeof value !== 'string' || !guidPattern.test(value)) return invalid(kind);
  return value;
}
function date(value: unknown, kind: 'rest' | 'heal'): string {
  if (!isValidServerTimestamp(value)) return invalid(kind);
  return value;
}
function whole(value: unknown, kind: 'rest' | 'heal', minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) return invalid(kind);
  return value;
}
function flag(value: unknown, kind: 'rest' | 'heal'): boolean {
  if (typeof value !== 'boolean') return invalid(kind);
  return value;
}
function sameGuid(value: unknown, requested: string, kind: 'rest' | 'heal'): string {
  const returned = guid(value, kind);
  if (!guidPattern.test(requested) || returned.toLowerCase() !== requested.toLowerCase()) return invalid(kind);
  return returned;
}
function healthChange(raw: Record<string, unknown>, kind: 'rest' | 'heal') {
  const previousHealth = whole(raw.previousHealth, kind, 1);
  const currentHealth = whole(raw.currentHealth, kind, 1);
  const maxHealth = whole(raw.maxHealth, kind, 1);
  const restoredHealth = whole(raw.restoredHealth, kind, 1);
  if (previousHealth >= maxHealth || currentHealth > maxHealth ||
      previousHealth + restoredHealth !== currentHealth) return invalid(kind);
  return { previousHealth, currentHealth, maxHealth, restoredHealth };
}

export function parseCharacterRestResult(raw: unknown, requestedKey: string): CharacterRestResult {
  const kind = 'rest';
  const value = record(raw, kind);
  const idempotencyKey = sameGuid(value.idempotencyKey, requestedKey, kind);
  const change = healthChange(value, kind);
  const restedAtUtc = date(value.restedAtUtc, kind);
  const nextRestAtUtc = date(value.nextRestAtUtc, kind);
  if (Date.parse(nextRestAtUtc) <= Date.parse(restedAtUtc)) return invalid(kind);
  return {
    idempotencyKey, ...change, restedAtUtc, nextRestAtUtc,
    replayed: flag(value.replayed, kind),
  };
}

export function parseCharacterItemHealResult(
  raw: unknown, requestedGrantId: string, requestedKey: string,
): CharacterItemHealResult {
  const kind = 'heal';
  const value = record(raw, kind);
  const grantId = sameGuid(value.grantId, requestedGrantId, kind);
  const idempotencyKey = sameGuid(value.idempotencyKey, requestedKey, kind);
  return {
    grantId, idempotencyKey, ...healthChange(value, kind),
    consumedAtUtc: date(value.consumedAtUtc, kind),
    replayed: flag(value.replayed, kind),
  };
}

/** Validate an authoritative post-mutation loadout, never assume a 200 succeeded. */
export function requireEquipConfirmed<T extends {
  items: ReadonlyArray<{ grantId: string }>;
}>(equipment: T, requestedGrantId: string): T {
  if (!guidPattern.test(requestedGrantId) ||
      !equipment.items.some(item => item.grantId.toLowerCase() === requestedGrantId.toLowerCase())) {
    throw new Error('equipment_invalid_response');
  }
  return equipment;
}

export function requireUnequipConfirmed<T extends {
  items: ReadonlyArray<{ slot: string }>;
}>(equipment: T, requestedSlot: 'relic' | 'charm'): T {
  if (equipment.items.some(item => item.slot === requestedSlot)) {
    throw new Error('equipment_invalid_response');
  }
  return equipment;
}
