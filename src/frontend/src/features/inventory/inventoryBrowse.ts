import type { EquipmentView, InventoryStack } from './equipmentApi';
import type { InventoryAward } from './inventoryApi';

export type InventoryBrowseFilter = 'all' | 'equipped' | 'available';
export type InventoryBrowseSort = 'name' | 'quantity';
export type InventoryBrowseSlot = 'all' | 'relic' | 'charm';

/** Only these canonical item keys have equipment slots in the current rules. */
export function equipmentSlotFor(itemKey: string): Exclude<InventoryBrowseSlot, 'all'> | null {
  if (itemKey === 'item.rune_shard.v1') return 'relic';
  if (itemKey === 'item.grove_seed.v1' || itemKey === 'item.tidal_pearl.v1') return 'charm';
  return null;
}

type BrowseInput = {
  stacks: readonly InventoryStack[];
  awards: readonly InventoryAward[];
  loadout: EquipmentView;
  query: string;
  filter: InventoryBrowseFilter;
  slot?: InventoryBrowseSlot;
  sort: InventoryBrowseSort;
  locale: 'it' | 'en';
  itemLabel: (itemKey: string) => string;
};

export type InventoryBrowseResult = {
  stacks: InventoryStack[];
  awards: InventoryAward[];
};

/** Search is presentation-only; the API and its ownership checks remain authoritative. */
function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function browseInventory(input: BrowseInput): InventoryBrowseResult {
  const { stacks, awards, loadout, filter, sort, itemLabel, locale } = input;
  const slot = input.slot ?? 'all';
  const matchesSlot = (itemKey: string) => slot === 'all' || equipmentSlotFor(itemKey) === slot;
  const needle = normalizeSearch(input.query);
  const equipped = new Set(loadout.items.map(item => item.grantId));
  const equippedTypes = new Set(loadout.items.map(item => item.itemKey));
  const available = new Set(stacks.flatMap(stack => stack.availableGrantIds));
  const searchable = (itemKey: string) =>
    !needle || normalizeSearch(itemLabel(itemKey)).includes(needle) ||
    normalizeSearch(itemKey).includes(needle);
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const byName = (a: string, b: string) =>
    collator.compare(itemLabel(a), itemLabel(b)) || collator.compare(a, b);
  const byQuantity = (a: number, b: number) => sort === 'quantity' ? b - a : 0;

  const filteredStacks = stacks.filter(stack => {
    if (!searchable(stack.itemKey) || !matchesSlot(stack.itemKey)) return false;
    if (filter === 'equipped') return equippedTypes.has(stack.itemKey);
    if (filter === 'available') return stack.availableGrantIds.length > 0;
    return true;
  }).sort((a, b) => byQuantity(a.quantity, b.quantity) || byName(a.itemKey, b.itemKey));

  const filteredAwards = awards.filter(award => {
    if (!searchable(award.itemKey) || !matchesSlot(award.itemKey)) return false;
    if (filter === 'equipped') return equipped.has(award.grantId);
    if (filter === 'available') return available.has(award.grantId);
    return true;
  }).sort((a, b) => byQuantity(a.quantity, b.quantity) ||
    byName(a.itemKey, b.itemKey) || collator.compare(a.grantId, b.grantId));

  return { stacks: filteredStacks, awards: filteredAwards };
}
