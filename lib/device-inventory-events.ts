export const DEVICE_INVENTORY_CHANGED_EVENT = 'infrascope:device-inventory-changed';
export const DEVICE_INVENTORY_CHANGED_STORAGE_KEY = 'infrascope:device-inventory-changed';

export type DeviceInventoryChangeAction = 'create' | 'update' | 'delete' | 'refresh';

export interface DeviceInventoryChangeDetail {
  action: DeviceInventoryChangeAction;
  deviceId?: string;
  source?: string;
  timestamp?: number;
}

export function notifyDeviceInventoryChanged(detail: DeviceInventoryChangeDetail) {
  if (typeof window === 'undefined') return;

  const payload = {
    ...detail,
    timestamp: detail.timestamp || Date.now(),
  };

  window.dispatchEvent(new CustomEvent<DeviceInventoryChangeDetail>(
    DEVICE_INVENTORY_CHANGED_EVENT,
    { detail: payload }
  ));

  try {
    window.localStorage.setItem(DEVICE_INVENTORY_CHANGED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort cross-tab notification only.
  }
}
