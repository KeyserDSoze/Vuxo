/**
 * A successful GET of equipment and inventory stacks is not an atomic snapshot:
 * another device may commit equip/unequip/heal between the two HTTP requests.
 * Verify their shared grant and quantity invariants before enabling actions.
 * The server/database remain authoritative; this is an advisory read fence.
 */
export type SnapshotStack = {
  itemKey: string;
  quantity: number;
  equippedQuantity: number;
  availableGrantIds: readonly string[];
};
export type SnapshotEquipment = {
  items: readonly { grantId: string; itemKey: string; slot: 'relic' | 'charm' }[];
};

export function assertEquipmentStackConsistency(
  stacks: readonly SnapshotStack[], equipment: SnapshotEquipment,
): void {
  const counts = new Map<string, number>();
  const available = new Set<string>();
  for (const stack of stacks) {
    if (counts.has(stack.itemKey)) throw new Error('inventory_snapshot_conflict');
    counts.set(stack.itemKey, 0);
    for (const id of stack.availableGrantIds) {
      const canonicalId = id.toLowerCase();
      if (available.has(canonicalId)) throw new Error('inventory_snapshot_conflict');
      available.add(canonicalId);
    }
  }
  const equippedGrants = new Set<string>();
  for (const item of equipment.items) {
    const canonicalId = item.grantId.toLowerCase();
    if (equippedGrants.has(canonicalId) || available.has(canonicalId) || !counts.has(item.itemKey)) {
      throw new Error('inventory_snapshot_conflict');
    }
    equippedGrants.add(canonicalId);
    counts.set(item.itemKey, (counts.get(item.itemKey) ?? 0) + 1);
  }
  for (const stack of stacks) {
    if (counts.get(stack.itemKey) !== stack.equippedQuantity) {
      throw new Error('inventory_snapshot_conflict');
    }
  }
}

/**
 * Retry once for a torn pair of GETs. Every attempt fetches both resources
 * again; never combine the old equipment with fresh stacks or vice versa.
 * Caller owns the AbortSignal and must still fence its session before publish.
 */
export async function readConsistentEquipmentSnapshot<S extends SnapshotStack, E extends SnapshotEquipment>(
  read: () => Promise<readonly [readonly S[], E]>, signal?: AbortSignal,
): Promise<{ stacks: S[]; equipment: E }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw new Error('inventory_snapshot_cancelled');
    const [stacks, equipment] = await read();
    if (signal?.aborted) throw new Error('inventory_snapshot_cancelled');
    try {
      assertEquipmentStackConsistency(stacks, equipment);
      return { stacks: [...stacks], equipment };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'inventory_snapshot_conflict') throw error;
      if (attempt === 1) throw error;
    }
  }
  throw new Error('inventory_snapshot_conflict');
}
