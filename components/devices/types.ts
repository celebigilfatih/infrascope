import type { RackRecord } from '@/components/racks/types';

export interface InventoryDevice {
  id: string; name: string; type: string; status: string; criticality: string;
  vendor?: string | null; model?: string | null; serialNumber?: string | null;
  assetTag?: string | null; supportDate?: string | null;
  rackId?: string | null; rackUnitPosition?: number | null;
  rack?: RackRecord | null; metadata?: unknown;
  managementIp?: string | null; nmsDeviceId?: number | null; pollingEnabled?: boolean;
}

export interface DeviceFormValues {
  name: string; type: string; vendor: string; model: string; serialNumber: string;
  supportDate: string | null; criticality: string; status: string;
  rackId: string | null; rackUnitPosition: number | null; unitHeight: number;
}

export { INVENTORY_DEVICE_TYPES as INVENTORY_TYPES } from '@/lib/devices/inventory-query';
