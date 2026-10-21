import type { Node, Edge } from 'reactflow';
import { isBuildingPosition, type BuildingPosition } from './building-layout';

export const NETWORK_GROUP_KINDS = ['WAN', 'VPN', 'MPLS', 'LAN', 'OTHER'] as const;
export const networkGroupKindLabel = (kind: string) => kind === 'OTHER' ? 'Diğer' : kind;
export interface NetworkGroup {
  id: string; name: string; organizationId: string; kind: string; sourceDeviceId: string; sourcePortId: string | null;
  sourceDevice: { id: string; name: string; managementIp: string | null; buildingId: string | null };
  sourcePort: { id: string; name: string } | null;
  lineStatus: { status: string; lastPolledAt: string | null };
  members: { buildingId: string; name: string }[];
  positions: Partial<Record<'building' | 'physical', BuildingPosition>>;
  version: number;
}
export function groupPositions(value: unknown): NetworkGroup['positions'] {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  return Object.fromEntries(['building', 'physical'].flatMap(key => isBuildingPosition(row[key]) ? [[key, row[key]]] : []));
}
export const networkGroupNodeId = (id: string) => `network-group-${id}`;
export function readExpandedNetworkGroups(value: string | null): Set<string> {
  try { const ids: unknown = JSON.parse(value || '[]'); return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length < 180) : []); } catch { return new Set(); }
}

// A projection only: it never writes to device links, ports, or physical layouts.
export function projectNetworkGroups(nodes: Node[], edges: Edge[], groups: NetworkGroup[], expanded: ReadonlySet<string>, view: string, buildingByDevice: Map<string, string>, onToggle: (id: string) => void, onInspect: (id: string) => void) {
  if (!['building', 'physical'].includes(view) || !groups.length) return { nodes, edges };
  const byBuilding = new Map(groups.flatMap(group => group.members.map(member => [member.buildingId, group] as const)));
  const owner = new Map(nodes.flatMap(node => {
    const buildingId = view === 'building' ? node.data.buildingId : buildingByDevice.get(node.data.deviceId || node.id);
    const group = byBuilding.get(buildingId);
    return group ? [[node.id, group] as const] : [];
  }));
  const present = groups.filter(group => nodes.some(node => !node.hidden && owner.get(node.id)?.id === group.id));
  const hidden = new Set(nodes.filter(node => { const group = owner.get(node.id); return group && !expanded.has(group.id); }).map(node => node.id));
  const result = nodes.filter(node => !hidden.has(node.id));
  const remainingEdges = edges.filter(edge => !hidden.has(edge.source) && !hidden.has(edge.target));
  const visibleIds = new Set(result.map(node => node.id));
  present.forEach((group, index) => {
    const id = networkGroupNodeId(group.id), isOpen = expanded.has(group.id);
    const memberNodes = nodes.filter(node => owner.get(node.id)?.id === group.id);
    const sourceId = view === 'building' ? `building-${group.sourceDevice.buildingId}` : group.sourceDeviceId;
    const source = nodes.find(node => node.id === sourceId);
    const defaultPosition = { x: (source?.position.x || 0) + 360, y: (source?.position.y || 0) + 280 + index * 220 };
    const position = group.positions[view as 'building' | 'physical'] || defaultPosition;
    // Avoid all existing icons; expanding never relocates saved member nodes.
    const placed = { ...position };
    if (!group.positions[view as 'building' | 'physical']) while (result.some(node => Math.abs(node.position.x - placed.x) < 300 && Math.abs(node.position.y - placed.y) < 180)) placed.y += 200;
    result.push({ id, type: 'networkGroup', ariaLabel: `${group.name}, ${group.members.length} konum`, position: placed, connectable: false, data: { group, expanded: isOpen, visibleMembers: memberNodes.length, onToggle: () => onToggle(group.id), onInspect: () => onInspect(group.id) } });
    const logical = (a: string, b: string, suffix: string, count?: number) => {
      if (a === b) return;
      remainingEdges.push({ id: `network-group-relation-${group.id}-${suffix}`, ariaLabel: `${group.name}: ${count ? `${count} bağlantının mantıksal özeti` : 'Mantıksal ağ ilişkisi'}`, source: a, target: b, type: 'smoothstep', sourceHandle: null, targetHandle: null, label: count ? `Mantıksal özet · ${count} bağlantı` : 'Mantıksal ağ ilişkisi', style: { stroke: '#0d9488', strokeDasharray: '3 6', strokeWidth: 2 }, labelStyle: { fontSize: 11, fill: '#0f766e' }, data: { isNetworkGroupRelation: true, groupId: group.id, onInspect: () => onInspect(group.id) } });
    };
    if (isOpen) {
      if (visibleIds.has(sourceId)) logical(sourceId, id, 'uplink');
      if (view === 'building') memberNodes.forEach(node => logical(id, node.id, node.id));
    } else {
      // Preserve every external path as an inspectable summary, including backups.
      const crossings = new Map<string, number>();
      edges.forEach(edge => {
        const a = hidden.has(edge.source) && owner.get(edge.source)?.id === group.id;
        const b = hidden.has(edge.target) && owner.get(edge.target)?.id === group.id;
        if (a === b) return;
        let outside = a ? edge.target : edge.source;
        if (hidden.has(outside)) outside = networkGroupNodeId(owner.get(outside)!.id);
        crossings.set(outside, (crossings.get(outside) || 0) + 1);
      });
      if (!crossings.has(sourceId) && visibleIds.has(sourceId)) logical(sourceId, id, 'uplink');
      crossings.forEach((count, outside) => logical(outside, id, outside, count));
    }
  });
  const ids = new Set(result.map(node => node.id));
  const relationPairs = new Set<string>();
  return { nodes: result, edges: remainingEdges.filter(edge => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return false;
    if (!edge.data?.isNetworkGroupRelation) return true;
    const key = [edge.source, edge.target].sort().join('|');
    if (relationPairs.has(key)) return false;
    relationPairs.add(key); return true;
  }) };
}
