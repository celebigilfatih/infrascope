export class InventorySyncBusyError extends Error {
  readonly code = 'INVENTORY_SYNC_BUSY';
  constructor() { super('An inventory sync is already running for this source'); }
}

type State = { running: Set<string>; completed: Map<string, number> };
function state(): State {
  const root = globalThis as typeof globalThis & { __inventorySyncCoordinator?: State };
  return root.__inventorySyncCoordinator ??= { running: new Set(), completed: new Map() };
}

/** Same saved connection is serialized; scoped VMware/Zabbix sources can run independently. */
export async function withInventorySync<T>(type: string, configId: string, work: () => Promise<T>, recordCompletion: () => boolean = () => true): Promise<T> {
  const current = state();
  const key = type === 'VMWARE_VCENTER' || type === 'ZABBIX' ? JSON.stringify([type, configId]) : type;
  if (current.running.has(key)) throw new InventorySyncBusyError();
  current.running.add(key);
  try { return await work(); }
  finally { if (recordCompletion()) current.completed.set(configId, Date.now()); current.running.delete(key); }
}

export function isInventorySyncInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440;
}

export function inventorySyncDueAt(config: { id: string; syncInterval: number; lastSyncAt: Date | null; createdAt: Date }): number {
  if (!isInventorySyncInterval(config.syncInterval)) {
    throw new Error('Inventory sync interval must be between 1 and 1440 minutes');
  }
  const anchor = Math.max(config.lastSyncAt?.getTime() ?? config.createdAt.getTime(), state().completed.get(config.id) ?? 0);
  if (!Number.isFinite(anchor)) throw new Error('Inventory sync schedule timestamp is invalid');
  return anchor + config.syncInterval * 60_000;
}

export function forgetRemovedInventorySchedules(ids: Set<string>): void {
  for (const id of state().completed.keys()) if (!ids.has(id)) state().completed.delete(id);
}
