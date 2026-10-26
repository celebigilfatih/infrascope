import type { NetworkGroup } from './network-groups';
import { topologySearchText } from './search';

export interface GroupFocusDevice {
  id: string;
  name: string;
  managementIp?: string | null;
  status: string;
  buildingId: string | null;
}

// Group membership is configuration; device visibility is a separate filter.
export function networkGroupSites(group: NetworkGroup, devices: GroupFocusDevice[], visibleIds: ReadonlySet<string>, query: string, filtered: boolean) {
  const term = topologySearchText(query);
  return group.members.map(member => {
    const assigned = devices.filter(device => device.buildingId === member.buildingId);
    const visible = assigned.filter(device => visibleIds.has(device.id));
    const matchesSite = topologySearchText(member.name).includes(term);
    const matches = matchesSite ? visible : visible.filter(device => topologySearchText([device.name, device.managementIp].filter(Boolean).join(' ')).includes(term));
    return { ...member, total: assigned.length, devices: matches, visibleCount: visible.length, matchesSite };
  }).filter(site => (!filtered || site.visibleCount > 0) && (!term || site.matchesSite || site.devices.length > 0))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
}

export function groupInventorySummary(devices: GroupFocusDevice[]) {
  const active = devices.filter(device => device.status === 'ACTIVE').length;
  const inactive = devices.filter(device => ['INACTIVE', 'ERROR'].includes(device.status)).length;
  return { active, inactive, other: devices.length - active - inactive };
}
