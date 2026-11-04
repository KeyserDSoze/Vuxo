import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export type InventoryStack = {
  itemKey: string;
  quantity: number;
  equippedQuantity: number;
  availableGrantIds: string[];
};

export type EquipmentItem = {
  slot: 'relic' | 'charm';
  grantId: string;
  itemKey: string;
  equippedAtUtc: string;
};

export type EffectiveEquipmentStats = {
  strength: number;
  dexterity: number;
  intelligence: number;
  constitution: number;
  luck: number;
  faith: number;
  maxHealth: number;
  movementSpeedMultiplier: number;
  bonuses: {
    strength: number; dexterity: number; intelligence: number;
    constitution: number; luck: number; faith: number;
  };
};

export type EquipmentView = {
  items: EquipmentItem[];
  stats: EffectiveEquipmentStats | null;
  ruleVersion: string;
};

export class EquipmentApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function equipmentRequest<T>(
  path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET',
  signal?: AbortSignal
): Promise<T> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new EquipmentApiError('inventory_authentication_required', 401);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method, signal, headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let code = response.status === 401 ? 'inventory_authentication_required' : 'inventory_request_failed';
    try {
      const json = await response.json() as { code?: unknown };
      if (typeof json.code === 'string') code = json.code;
    } catch {
      // Proxy/network failures retain a stable fallback code.
    }
    throw new EquipmentApiError(code, response.status);
  }
  return response.json() as Promise<T>;
}

export const fetchInventoryStacks = (signal?: AbortSignal) =>
  equipmentRequest<InventoryStack[]>('/api/inventory/stacks', 'GET', signal);

export const fetchEquipment = (signal?: AbortSignal) =>
  equipmentRequest<EquipmentView>('/api/equipment', 'GET', signal);

export const equipInventoryItem = (grantId: string) =>
  equipmentRequest<EquipmentView>(
    `/api/equipment/${encodeURIComponent(grantId)}/equip`, 'POST'
  );

export const unequipInventoryItem = (slot: 'relic' | 'charm') =>
  equipmentRequest<EquipmentView>(
    `/api/equipment/${encodeURIComponent(slot)}`, 'DELETE'
  );
