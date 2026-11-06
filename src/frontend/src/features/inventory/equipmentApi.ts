import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';
import {
  parseInventoryStacks, parseEquipmentView,
  type InventoryStack, type EquipmentView,
} from '../contracts/ownerReadContracts';

export type { InventoryStack, EquipmentItem, EffectiveEquipmentStats, EquipmentView } from '../contracts/ownerReadContracts';

export class EquipmentApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function equipmentRequest<T>(
  path: string, method: 'GET' | 'POST' | 'DELETE',
  parse: (raw: unknown) => T, signal?: AbortSignal,
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
  return parse(await response.json() as unknown);
}

export const fetchInventoryStacks = (signal?: AbortSignal) =>
  equipmentRequest<InventoryStack[]>('/api/inventory/stacks', 'GET', parseInventoryStacks, signal);

export const fetchEquipment = (signal?: AbortSignal) =>
  equipmentRequest<EquipmentView>('/api/equipment', 'GET', parseEquipmentView, signal);

export const equipInventoryItem = (grantId: string) =>
  equipmentRequest<EquipmentView>(
    `/api/equipment/${encodeURIComponent(grantId)}/equip`, 'POST', parseEquipmentView
  );

export const unequipInventoryItem = (slot: 'relic' | 'charm') =>
  equipmentRequest<EquipmentView>(
    `/api/equipment/${encodeURIComponent(slot)}`, 'DELETE', parseEquipmentView
  );
