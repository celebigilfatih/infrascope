import type { DeviceStatus, DeviceType, Prisma } from '@prisma/client';

export const INVENTORY_DEVICE_TYPES = ['PHYSICAL_SERVER', 'VIRTUAL_HOST', 'VIRTUAL_MACHINE', 'FIREWALL', 'SWITCH', 'ROUTER', 'COMPUTER', 'LAPTOP', 'STORAGE', 'PDU', 'PATCH_PANEL', 'PRINTER', 'CAMERA', 'OTHER'];
const ALL_TYPES = [...INVENTORY_DEVICE_TYPES, 'VLAN', 'VMWARE_CLUSTER', 'VMWARE_DATASTORE'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN'];
export class InventoryQueryError extends Error {}

export function inventoryQuery(params: URLSearchParams) {
  const rawPage = Number(params.get('page'));
  const rawLimit = Number(params.get('limit'));
  const page = Math.max(1, Math.floor(Number.isFinite(rawPage) ? rawPage || 1 : 1));
  const limit = Math.max(1, Math.min(200, Math.floor(Number.isFinite(rawLimit) ? rawLimit || 25 : 25)));
  const filterType = params.get('filterType') || 'manual';
  const search = (params.get('search') || '').trim();
  const rackId = params.get('rackId') || 'all';
  const status = params.get('status') || 'all';
  const placement = params.get('placement') || 'all';
  const and: Prisma.DeviceWhereInput[] = [];
  if (filterType === 'manual') and.push({ type: { in: INVENTORY_DEVICE_TYPES as DeviceType[] } });
  else if (filterType !== 'all') {
    if (!ALL_TYPES.includes(filterType)) throw new InventoryQueryError('Geçerli bir cihaz tipi seçin.');
    and.push({ type: filterType as DeviceType });
  }
  if (search) and.push({ OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { serialNumber: { contains: search, mode: 'insensitive' } },
    { vendor: { contains: search, mode: 'insensitive' } },
    { model: { contains: search, mode: 'insensitive' } },
    { managementIp: { contains: search, mode: 'insensitive' } },
  ] });
  if (rackId !== 'all') and.push({ rackId: rackId === 'unassigned' ? null : rackId });
  if (status !== 'all') {
    if (!STATUSES.includes(status)) throw new InventoryQueryError('Geçerli bir cihaz durumu seçin.');
    and.push({ status: status as DeviceStatus });
  }
  if (placement === 'pending') and.push({ rackId: { not: null }, OR: [{ rackUnitPosition: null }, { rackUnitPosition: { lte: 0 } }] });
  else if (placement === 'positioned') and.push({ rackId: { not: null }, rackUnitPosition: { gt: 0 } });
  else if (placement !== 'all') throw new InventoryQueryError('Geçerli bir yerleşim filtresi seçin.');
  return { page, limit, where: and.length ? { AND: and } : {} };
}
