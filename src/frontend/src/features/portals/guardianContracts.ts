import { compareServerTimestamps, isValidServerTimestamp } from '../contracts/serverTimestamp.ts';

/**
 * Validated projections of server-owned PvE state. These runtime checks
 * protect the UI from malformed 200 responses; they never resolve combat.
 */
export type GuardianAction = 'strike' | 'guard' | 'feint';
export type GuardianOutcome = 'ongoing' | 'victory' | 'retreat';
export type GuardianStatus = {
  grantId: string;
  turn: number;
  guardianHealth: number;
  guardianMaxHealth: number;
  playerHealth: number;
  playerMaxHealth: number;
  outcome: GuardianOutcome;
  ruleVersion: string;
};
export type GuardianTurn = Omit<GuardianStatus, 'ruleVersion'> & {
  idempotencyKey: string;
  action: GuardianAction;
  guardianAction: GuardianAction;
  damageDealt: number;
  damageTaken: number;
  replayed: boolean;
};
export type GuardianHistoryEntry = {
  turn: number;
  action: GuardianAction;
  guardianAction: GuardianAction;
  damageDealt: number;
  damageTaken: number;
  guardianHealth: number;
  playerHealth: number;
  outcome: GuardianOutcome;
  occurredAtUtc: string;
};

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TURNS = 12;
const invalid = (history = false): never => {
  throw new Error(history ? 'guardian_history_unavailable' : 'guardian_invalid_response');
};
function record(raw: unknown, history = false): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(history);
  return raw as Record<string, unknown>;
}
function integer(raw: unknown, min: number, max: number, history = false): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max)
    return invalid(history);
  return raw;
}
function guid(raw: unknown): string {
  if (typeof raw !== 'string' || !guidPattern.test(raw)) return invalid();
  return raw;
}
function action(raw: unknown, history = false): GuardianAction {
  if (raw !== 'strike' && raw !== 'guard' && raw !== 'feint') return invalid(history);
  return raw;
}
function guardianAction(raw: unknown, history = false): GuardianAction {
  if (raw !== 'strike' && raw !== 'guard') return invalid(history);
  return raw;
}
function outcome(raw: unknown, history = false): GuardianOutcome {
  if (raw !== 'ongoing' && raw !== 'victory' && raw !== 'retreat') return invalid(history);
  return raw;
}
function sameGuid(raw: unknown, requested: string): string {
  const value = guid(raw);
  if (!guidPattern.test(requested) || value.toLowerCase() !== requested.toLowerCase())
    return invalid();
  return value;
}
function limits(raw: Record<string, unknown>) {
  const guardianMaxHealth = integer(raw.guardianMaxHealth, 1, 100_000);
  const guardianHealth = integer(raw.guardianHealth, 0, guardianMaxHealth);
  const playerMaxHealth = integer(raw.playerMaxHealth, 1, 100_000);
  // Owner HP can legitimately reach zero because of a different authoritative event.
  const playerHealth = integer(raw.playerHealth, 0, playerMaxHealth);
  return { guardianHealth, guardianMaxHealth, playerHealth, playerMaxHealth };
}
function outcomeMatchesHealth(value: GuardianOutcome, guardianHealth: number, turn: number): void {
  if (value === 'victory' ? guardianHealth !== 0 :
      guardianHealth === 0 || value === 'ongoing' && turn === MAX_TURNS) invalid();
}

export function parseGuardianStatus(raw: unknown, requestedGrantId: string): GuardianStatus {
  const value = record(raw);
  const grantId = sameGuid(value.grantId, requestedGrantId);
  const turn = integer(value.turn, 0, MAX_TURNS);
  const health = limits(value);
  const state = outcome(value.outcome);
  const ruleVersion = value.ruleVersion;
  if (ruleVersion !== 'portal-guardian-showdown-v1' &&
      ruleVersion !== 'portal-guardian-showdown-v2') invalid();
  outcomeMatchesHealth(state, health.guardianHealth, turn);
  return { grantId, turn, ...health, outcome: state, ruleVersion: ruleVersion as string };
}

export function parseGuardianTurn(
  raw: unknown, expected: {
    grantId: string; action: GuardianAction; expectedTurn: number; idempotencyKey: string;
  },
): GuardianTurn {
  const value = record(raw);
  const grantId = sameGuid(value.grantId, expected.grantId);
  const idempotencyKey = sameGuid(value.idempotencyKey, expected.idempotencyKey);
  const expectedTurn = integer(expected.expectedTurn, 0, MAX_TURNS - 1);
  const turn = integer(value.turn, 1, MAX_TURNS);
  if (turn !== expectedTurn + 1 || action(value.action) !== expected.action) invalid();
  const reply = guardianAction(value.guardianAction);
  const health = limits(value);
  const state = outcome(value.outcome);
  const damageDealt = integer(value.damageDealt, 0, health.guardianMaxHealth);
  const damageTaken = integer(value.damageTaken, 0, health.playerMaxHealth);
  const replayed = value.replayed;
  if (typeof replayed !== 'boolean') invalid();
  outcomeMatchesHealth(state, health.guardianHealth, turn);
  return {
    grantId, idempotencyKey, turn, action: expected.action,
    guardianAction: reply, damageDealt, damageTaken,
    ...health, outcome: state, replayed: replayed as boolean,
  };
}

export function parseGuardianHistory(raw: unknown): GuardianHistoryEntry[] {
  if (!Array.isArray(raw) || raw.length > MAX_TURNS) return invalid(true);
  let lastTime: string | null = null;
  let finished = false;
  return raw.map((item, index) => {
    const value = record(item, true);
    const turn = integer(value.turn, 1, MAX_TURNS, true);
    if (turn !== index + 1 || finished) return invalid(true);
    const card = action(value.action, true);
    const opponent = guardianAction(value.guardianAction, true);
    const guardianHealth = integer(value.guardianHealth, 0, 100_000, true);
    const playerHealth = integer(value.playerHealth, 0, 100_000, true);
    const damageDealt = integer(value.damageDealt, 0, 100_000, true);
    const damageTaken = integer(value.damageTaken, 0, 100_000, true);
    const state = outcome(value.outcome, true);
    if (state === 'victory' ? guardianHealth !== 0 :
        guardianHealth === 0 || state === 'ongoing' && turn === MAX_TURNS)
      return invalid(true);
    if (!isValidServerTimestamp(value.occurredAtUtc)) return invalid(true);
    const occurredAtUtc = value.occurredAtUtc;
    if (lastTime && compareServerTimestamps(occurredAtUtc, lastTime) < 0) return invalid(true);
    lastTime = occurredAtUtc;
    finished = state !== 'ongoing';
    return {
      turn, action: card, guardianAction: opponent,
      damageDealt, damageTaken, guardianHealth, playerHealth,
      outcome: state, occurredAtUtc,
    };
  });
}
