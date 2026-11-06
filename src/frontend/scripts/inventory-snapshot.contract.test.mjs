import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEquipmentStackConsistency, readConsistentEquipmentSnapshot } from '../src/features/inventory/inventorySnapshotConsistency.ts';

const rune = '11111111-1111-4111-8111-111111111111';
const seed = '22222222-2222-4222-8222-222222222222';
const empty = { items: [] };
const equipped = { items: [{ grantId: rune, itemKey: 'item.rune_shard.v1', slot: 'relic' }] };
const stack = (quantity, equippedQuantity, availableGrantIds = []) =>
  [{ itemKey: 'item.rune_shard.v1', quantity, equippedQuantity, availableGrantIds }];
const invalid = (s, e) => assert.throws(() => assertEquipmentStackConsistency(s, e), { message: 'inventory_snapshot_conflict' });

test('valid empty snapshots are safe', () => assert.doesNotThrow(() => assertEquipmentStackConsistency([], empty)));
test('unspent grants can remain available', () => assert.doesNotThrow(() => assertEquipmentStackConsistency(stack(1, 0, [rune]), empty)));
test('equipped grant is present with correct equipped quantity', () => assert.doesNotThrow(() => assertEquipmentStackConsistency(stack(1, 1), equipped)));
test('equipment older than inventory: stock now available but stale loadout still equipped is rejected', () => invalid(stack(1, 0, [rune]), equipped));
test('inventory older than equipment: equipment now empty but stack still says equipped is rejected', () => invalid(stack(1, 1), empty));
test('equipped grant cannot simultaneously appear in available grants', () => invalid(stack(2, 1, [rune]), equipped));
test('a post-heal missing stack cannot coexist with an old equipped item', () => invalid([], equipped));
test('two equipped slots of same item require matching stack count', () => invalid(stack(2, 1), { items: [
  equipped.items[0], { grantId: seed, itemKey: 'item.rune_shard.v1', slot: 'charm' },
] }));
test('one torn first GET pair retries and accepts the second matching pair', async () => {
  let attempts = 0;
  const result = await readConsistentEquipmentSnapshot(async () => {
    attempts++;
    return attempts === 1 ? [stack(1, 0, [rune]), equipped] : [stack(1, 1), equipped];
  });
  assert.equal(attempts, 2);
  assert.equal(result.equipment.items.length, 1);
  assert.equal(result.stacks[0].equippedQuantity, 1);
});
test('two conflicting pairs fail closed without a third unbounded retry', async () => {
  let attempts = 0;
  await assert.rejects(readConsistentEquipmentSnapshot(async () => {
    attempts++;
    return [stack(1, 0, [rune]), equipped];
  }), { message: 'inventory_snapshot_conflict' });
  assert.equal(attempts, 2);
});
test('aborted session does not publish a completed read', async () => {
  const controller = new AbortController();
  await assert.rejects(readConsistentEquipmentSnapshot(async () => {
    controller.abort();
    return [stack(1, 1), equipped];
  }, controller.signal), { message: 'inventory_snapshot_cancelled' });
});

test('case-variant grant in available and equipped is rejected', () => {
  const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  invalid(stack(2, 1, [id.toUpperCase()]), { items: [{ ...equipped.items[0], grantId: id }] });
});
test('duplicated available grants across distinct stacks are rejected even with UUID case changes', () => {
  const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  invalid([{ itemKey: 'item.rune_shard.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [id] },
    { itemKey: 'item.grove_seed.v1', quantity: 1, equippedQuantity: 0, availableGrantIds: [id.toUpperCase()] }], empty);
});
test('duplicated equipped grant across slots is rejected despite matching equipped counts', () => {
  const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  invalid(stack(2, 2), { items: [
    { ...equipped.items[0], grantId: id },
    { ...equipped.items[0], grantId: id.toUpperCase(), slot: 'charm' },
  ] });
});
test('duplicate stack keys must not silently overwrite previous quantities', () => {
  invalid([...stack(1, 0, [rune]), ...stack(1, 0, [seed])], empty);
});
