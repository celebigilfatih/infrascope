import { INVENTORY_DEVICE_TYPES } from './inventory-query';

export interface InventoryFilters { type: string; search: string; rack: string; status: string; placement: string }
export function matchesInventoryFilters(device: { name: string; type: string; status: string; rackId?: string | null; rackUnitPosition?: number | null; serialNumber?: string | null; vendor?: string | null; model?: string | null; managementIp?: string | null }, filters: InventoryFilters) {
  if (filters.type !== 'all' && !(filters.type === 'manual' ? INVENTORY_DEVICE_TYPES.includes(device.type) : device.type === filters.type)) return false;
  if (filters.rack !== 'all' && (filters.rack === 'unassigned' ? Boolean(device.rackId) : device.rackId !== filters.rack)) return false;
  if (filters.status !== 'all' && device.status !== filters.status) return false;
  if (filters.placement === 'pending' && (!device.rackId || Number(device.rackUnitPosition) > 0)) return false;
  if (filters.placement === 'positioned' && (!device.rackId || !(Number(device.rackUnitPosition) > 0))) return false;
  const query = filters.search.trim().toLocaleLowerCase('tr-TR');
  return !query || [device.name, device.serialNumber, device.vendor, device.model, device.managementIp].some(value => value?.toLocaleLowerCase('tr-TR').includes(query));
}
