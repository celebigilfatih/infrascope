import { deviceLinkColor, DEVICE_LINK_UNKNOWN_COLOR } from './device-link-options';

export const BUILDING_CONNECTION_LEGEND = [
  { value: 'FIBER', label: 'Fiber', color: deviceLinkColor('FIBER'), types: ['FIBER_SINGLE_MODE', 'FIBER_MULTI_MODE'] },
  { value: 'ETHERNET', label: 'Ethernet / bakır', color: deviceLinkColor('ETHERNET'), types: ['CAT5E', 'CAT6', 'CAT6A', 'CAT7', 'CAT8'] },
  { value: 'WAN', label: 'WAN / kablosuz', color: deviceLinkColor('WAN'), types: ['WIRELESS', 'MICROWAVE', 'LEASED_LINE', 'MPLS', 'VPN'] },
  { value: 'OTHER', label: 'Diğer / bilinmeyen', color: DEVICE_LINK_UNKNOWN_COLOR, types: ['OTHER'] },
];
export const buildingConnectionGroup = (type: string) => BUILDING_CONNECTION_LEGEND.find(group => group.types.includes(type))?.value || 'OTHER';
export const buildingConnectionColor = (type: string) => BUILDING_CONNECTION_LEGEND.find(group => group.types.includes(type))?.color || DEVICE_LINK_UNKNOWN_COLOR;

export const BUILDING_CONNECTION_TYPES = [
  { value: 'FIBER_SINGLE_MODE', label: 'Tek modlu fiber' },
  { value: 'FIBER_MULTI_MODE', label: 'Çok modlu fiber' },
  { value: 'CAT5E', label: 'Cat 5e' },
  { value: 'CAT6', label: 'Cat 6' },
  { value: 'CAT6A', label: 'Cat 6a' },
  { value: 'CAT7', label: 'Cat 7' },
  { value: 'CAT8', label: 'Cat 8' },
  { value: 'WIRELESS', label: 'Kablosuz' },
  { value: 'MICROWAVE', label: 'Mikrodalga' },
  { value: 'LEASED_LINE', label: 'Kiralık hat' },
  { value: 'MPLS', label: 'MPLS' },
  { value: 'VPN', label: 'VPN' },
  { value: 'OTHER', label: 'Diğer' },
] as const;
export const BUILDING_CONNECTION_SPEEDS = ['100 Mbps', '1 Gbps', '2.5 Gbps', '10 Gbps', '25 Gbps', '40 Gbps', '100 Gbps'];

export interface BuildingEndpointSelection {
  sourceDeviceId: string; targetDeviceId: string; sourcePortId: string; targetPortId: string;
}
export interface BuildingEndpointDevice { id: string; name: string; managementIp: string | null }
export interface BuildingLinkedDevices {
  id: string; sourceDeviceId: string; targetDeviceId: string;
  sourceDevice: { id: string; name: string }; targetDevice: { id: string; name: string };
  endpoints: { side: number; portId: string; portKey: string; portName: string }[];
}

export function isBuildingConnectionSpeed(value: unknown): value is string | null {
  if (value === null || value === '') return true;
  return typeof value === 'string' && value.length <= 40 && /^\d+(?:[.,]\d+)?\s*(?:Kbps|Mbps|Gbps|Tbps)$/i.test(value.trim()) && Number.parseFloat(value.replace(',', '.')) > 0;
}
