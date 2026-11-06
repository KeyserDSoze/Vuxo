import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePlayerInventory, parseInventoryStacks, parseEquipmentView,
  parseCharacterHealth, parsePortalEncounterStatus,
} from '../src/features/contracts/ownerReadContracts.ts';

const grant1 = '11111111-1111-4111-8111-111111111111';
const grant2 = '22222222-2222-4222-8222-222222222222';
const grant3 = '33333333-3333-4333-8333-333333333333';
const inventoryAward = { grantId: grant1, itemKey: 'item.rune_shard.v1',
  quantity: 1, awardedAtUtc: '2026-11-01T10:00:00Z', consumed: false };
const inventoryStack = { itemKey: 'item.rune_shard.v1', quantity: 3,
  equippedQuantity: 1, availableGrantIds: [grant2] };
const equipped = { slot: 'relic', grantId: grant1, itemKey: 'item.rune_shard.v1',
  equippedAtUtc: '2026-11-01T10:00:00Z' };
const equipment = { items: [equipped], stats: null, ruleVersion: 'equipment-v1' };
const health = { name: 'Explorer', currentHealth: 12, maxHealth: 20, rulesVersion: 'character-health-v1' };
const active = { active: true, portalGrantId: grant3, expiresAtUtc: '2026-11-07T10:00:00Z' };
const bad = (fn, code) => assert.throws(fn, { message: code });

test('inventory awards preserve canonical keys, quantity and spent state', () => {
  assert.deepEqual(parsePlayerInventory([inventoryAward]), [inventoryAward]);
  const legacy = parsePlayerInventory([{ ...inventoryAward, consumed: undefined }]);
  assert.equal(legacy[0].consumed, undefined);
  assert.deepEqual(parsePlayerInventory([]), []);
});
test('inventory rejects duplicated grants and contradictory spent flags', () => {
  for (const sample of [
    [inventoryAward, inventoryAward],
    [{ ...inventoryAward, consumed: 'false' }],
    [{ ...inventoryAward, grantId: 'not-a-guid' }],
    [{ ...inventoryAward, quantity: 0 }],
    [{ ...inventoryAward, quantity: 1.5 }],
    [{ ...inventoryAward, awardedAtUtc: 'bad-time' }],
  ]) bad(() => parsePlayerInventory(sample), 'inventory_invalid_response');
});
test('stacks preserve positive quantities and available grant IDs without extrapolation', () => {
  assert.deepEqual(parseInventoryStacks([inventoryStack]), [inventoryStack]);
  assert.deepEqual(parseInventoryStacks([]), []);
});
test('stacks reject impossible equipped amounts or duplicate grant IDs', () => {
  for (const sample of [
    [{ ...inventoryStack, equippedQuantity: 4 }],
    [{ ...inventoryStack, quantity: -1 }],
    [{ ...inventoryStack, availableGrantIds: [grant2, grant2] }],
    [{ ...inventoryStack, quantity: 1, equippedQuantity: 1, availableGrantIds: [grant2] }],
    [inventoryStack, inventoryStack],
    [inventoryStack, { ...inventoryStack, itemKey: 'item.grove_seed.v1' }],
  ]) bad(() => parseInventoryStacks(sample), 'inventory_invalid_response');
});
test('equipment accepts empty loadouts and two distinct canonical slots', () => {
  const two = { ...equipment, items: [equipped, { ...equipped, slot: 'charm', grantId: grant3 }] };
  assert.equal(parseEquipmentView(two).items.length, 2);
  assert.deepEqual(parseEquipmentView({ ...equipment, items: [] }).items, []);
});
test('equipment rejects duplicated slots, duplicated grants and unsupported slots', () => {
  for (const items of [
    [equipped, { ...equipped, grantId: grant2 }],
    [equipped, { ...equipped, slot: 'charm' }],
    [{ ...equipped, slot: 'helmet' }],
    [{ ...equipped, equippedAtUtc: false }],
  ]) bad(() => parseEquipmentView({ ...equipment, items }), 'equipment_invalid_response');
});
test('effective equipment stats accept canonical numeric server data', () => {
  const bonuses = { strength: 0, dexterity: 1, intelligence: 2, constitution: 0, luck: 0, faith: 0 };
  const stats = { ...bonuses, maxHealth: 20, movementSpeedMultiplier: 1.05, bonuses };
  assert.equal(parseEquipmentView({ ...equipment, stats }).stats?.movementSpeedMultiplier, 1.05);
  bad(() => parseEquipmentView({ ...equipment, stats: { ...stats, bonuses: null } }), 'equipment_invalid_response');
  bad(() => parseEquipmentView({ ...equipment, stats: { ...stats, maxHealth: 0 } }), 'equipment_invalid_response');
  bad(() => parseEquipmentView({ ...equipment, stats: { ...stats, movementSpeedMultiplier: '1' } }), 'equipment_invalid_response');
});
test('HP 0, partial HP and full HP remain legitimate server states', () => {
  for (const currentHealth of [0, 12, 20])
    assert.equal(parseCharacterHealth({ ...health, currentHealth }).currentHealth, currentHealth);
});
test('invalid HP never creates a fake healthy character', () => {
  for (const payload of [
    { ...health, currentHealth: 21 }, { ...health, currentHealth: -1 },
    { ...health, currentHealth: 12.5 }, { ...health, maxHealth: 0 },
    { ...health, rulesVersion: '' }, { ...health, name: '' },
  ]) bad(() => parseCharacterHealth(payload), 'health_invalid_response');
});
test('encounter recognises true active lock and explicit idle state', () => {
  assert.deepEqual(parsePortalEncounterStatus(active), active);
  assert.deepEqual(parsePortalEncounterStatus({ active: false, portalGrantId: null, expiresAtUtc: null }),
    { active: false, portalGrantId: null, expiresAtUtc: null });
});
test('encounter fails closed on malformed active or contradictory idle payloads', () => {
  for (const payload of [
    { ...active, active: 'true' }, { ...active, portalGrantId: null },
    { ...active, expiresAtUtc: 'bad' }, { ...active, expiresAtUtc: null },
    { active: false, portalGrantId: grant1, expiresAtUtc: null },
    { active: false, portalGrantId: null, expiresAtUtc: '2026-11-07T10:00:00Z' },
  ]) bad(() => parsePortalEncounterStatus(payload), 'encounter_status_invalid_response');
});
test('untrusted owner or reward fields are never copied into UI read models', () => {
  assert.equal('playerId' in parsePlayerInventory([{ ...inventoryAward, playerId: 'attacker' }])[0], false);
  assert.equal('seed' in parseEquipmentView({ ...equipment, seed: 1234 }), false);
  assert.equal('isReadyForCombat' in parseCharacterHealth({ ...health, isReadyForCombat: true }), false);
  assert.equal('rewardKey' in parsePortalEncounterStatus({ ...active, rewardKey: 'fake' }), false);
});

test('inventory rejects UUID aliases even when the grant IDs differ only in letter case', () => {
  const grant = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  const first = { ...inventoryAward, grantId: grant };
  bad(() => parsePlayerInventory([first, { ...first, grantId: grant.toUpperCase() }]), 'inventory_invalid_response');
});
test('stacks reject case-variant UUID aliases in one stack or across stacks', () => {
  const grant = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  for (const response of [
    [{ ...inventoryStack, quantity: 2, equippedQuantity: 0, availableGrantIds: [grant, grant.toUpperCase()] }],
    [{ ...inventoryStack, quantity: 2, equippedQuantity: 0, availableGrantIds: [grant] },
      { ...inventoryStack, itemKey: 'item.grove_seed.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [grant.toUpperCase()] }],
  ]) bad(() => parseInventoryStacks(response), 'inventory_invalid_response');
});
test('equipment rejects case-variant UUID aliases across different slots', () => {
  const grant = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  bad(() => parseEquipmentView({ ...equipment, items: [
    { ...equipped, grantId: grant }, { ...equipped, slot: 'charm', grantId: grant.toUpperCase() },
  ] }), 'equipment_invalid_response');
});
test('distinct UUIDs remain valid and itemKey identities are not lowercased', () => {
  const grant = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  assert.equal(parsePlayerInventory([{ ...inventoryAward, grantId: grant }, { ...inventoryAward, grantId: grant2 }]).length, 2);
  assert.equal(parseInventoryStacks([
    { ...inventoryStack, itemKey: 'ITEM.rune_shard.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [grant] },
    { ...inventoryStack, itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [grant2] },
  ]).length, 2);
});
