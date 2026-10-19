export const DEVICE_LINK_TYPES = [
  { value: 'UNKNOWN', label: 'Tür belirtilmemiş', color: '#64748b' },
  { value: 'ETHERNET', label: 'Ethernet', color: '#2563eb' }, { value: 'FIBER', label: 'Fiber', color: '#7c3aed' },
  { value: 'SERIAL', label: 'Seri bağlantı', color: '#b45309' }, { value: 'MANAGEMENT', label: 'Yönetim', color: '#0d9488' }, { value: 'WAN', label: 'WAN', color: '#db2777' },
] as const;
export const DEVICE_LINK_UNKNOWN_COLOR = '#64748b';
export const deviceLinkGroup = (type?: string | null) => DEVICE_LINK_TYPES.find(item => item.value === type)?.value || 'UNKNOWN';
export const deviceLinkColor = (type: string) => DEVICE_LINK_TYPES.find(item => item.value === type)?.color || DEVICE_LINK_UNKNOWN_COLOR;
export const DEVICE_LINK_SPEEDS = ['Belirtilmemiş', '9.6 Kbps', '115.2 Kbps', '10 Mbps', '100 Mbps', '1 Gbps', '2.5 Gbps', '5 Gbps', '10 Gbps', '25 Gbps', '40 Gbps', '100 Gbps', '200 Gbps', '400 Gbps'] as const;
export interface DeviceLinkPort { id: string; name: string; key: string; kind: string; speed?: string; occupied: boolean }
export const portNameKey = (name: string) => name.trim().toLocaleLowerCase('en-US');
