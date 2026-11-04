import { getApiBaseUrl } from '../character/appearance';
import { readStoredSession } from '../auth/authSession';

export type InventoryAward = {
  grantId: string;
  itemKey: string;
  quantity: number;
  awardedAtUtc: string;
};

export const inventoryItemLabelKeys: Readonly<Record<string, string>> = {
  'item.rune_shard.v1': 'runeShard',
  'item.grove_seed.v1': 'groveSeed',
  'item.tidal_pearl.v1': 'tidalPearl',
  'item.swift_feather.v1': 'swiftFeather',
};

export class InventoryApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export async function fetchPlayerInventory(signal?: AbortSignal): Promise<InventoryAward[]> {
  const token = readStoredSession()?.accessToken;
  if (!token) throw new InventoryApiError('inventory_authentication_required', 401);

  const response = await fetch(`${getApiBaseUrl()}/api/inventory`, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    let code = response.status === 401 ? 'inventory_authentication_required' : 'inventory_request_failed';
    try {
      const body = await response.json() as { code?: unknown };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // Keep the stable fallback code for proxy/transport errors.
    }
    throw new InventoryApiError(code, response.status);
  }

  return response.json() as Promise<InventoryAward[]>;
}
