import type { Edge, Node } from 'reactflow';

interface Building { id: string; name: string }
interface Link { sourceBuildingId: string; destBuildingId: string; connectionType?: string }
interface Group { id: string; members: { buildingId: string }[]; sourceDevice: { buildingId: string | null } }
interface OverviewGraph { nodes: Node[]; edges: Edge[]; centerId: string | undefined; hiddenCrossLinks: Edge[]; crossLinks: Edge[]; positions: Record<string, { x: number; y: number }> }

// Stable automatic defaults under filters; saved positions take precedence. Callers control editing.
export function balancedBuildingOverview(nodes: Node[], edges: Edge[], buildings: Building[], links: Link[], groups: Group[], showCrossLinks: boolean, unassignedId: string, focusId?: string | null, savedPositions: Record<string, { x: number; y: number }> = {}): OverviewGraph {
  const grouped = new Set(groups.flatMap(group => group.members.map(member => member.buildingId)));
  const catalog = buildings.filter(building => !grouped.has(building.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR') || a.id.localeCompare(b.id));
  const neighbors = new Map(catalog.map(building => [building.id, new Set<string>()]));
  links.forEach(link => {
    if (link.sourceBuildingId === link.destBuildingId || !neighbors.has(link.sourceBuildingId) || !neighbors.has(link.destBuildingId)) return;
    neighbors.get(link.sourceBuildingId)!.add(link.destBuildingId);
    neighbors.get(link.destBuildingId)!.add(link.sourceBuildingId);
  });
  const anchors = new Set(groups.map(group => group.sourceDevice.buildingId));
  const hub = [...catalog].sort((a, b) => neighbors.get(b.id)!.size - neighbors.get(a.id)!.size || Number(anchors.has(b.id)) - Number(anchors.has(a.id)) || a.name.localeCompare(b.name, 'tr-TR'))[0];
  const centerId = hub ? `building-${hub.id}` : undefined;
  const positions: Record<string, { x: number; y: number }> = {};
  if (hub) positions[centerId!] = { x: 340, y: 270 };
  const otherLinkPeers = new Set(links.filter(link => link.connectionType === 'OTHER' && (link.sourceBuildingId === hub?.id || link.destBuildingId === hub?.id)).map(link => link.sourceBuildingId === hub?.id ? link.destBuildingId : link.sourceBuildingId));
  const regularPeers = catalog.filter(building => building.id !== hub?.id && !otherLinkPeers.has(building.id));
  const otherPeers = catalog.filter(building => building.id !== hub?.id && otherLinkPeers.has(building.id));
  // Leave an east-facing corridor for the logical network group relation.
  const peers = [...regularPeers.slice(0, 3), ...otherPeers, ...regularPeers.slice(3)];
  for (let start = 0, ring = 1; start < peers.length; start += 10, ring++) {
    const slice = peers.slice(start, start + 10);
    const members = slice.length === 9 ? [...slice.slice(0, 6), slice[8], ...slice.slice(6, 8)] : slice;
    members.forEach((building, index) => {
      const angle = members.length === 9 ? [-90, -50, -20, 35, 70, 105, 145, 185, 225][index] * Math.PI / 180 : -Math.PI / 2 + index * 2 * Math.PI / members.length;
      positions[`building-${building.id}`] = { x: Math.round(340 + Math.cos(angle) * 310 * ring), y: Math.round(270 + Math.sin(angle) * 270 * ring) };
    });
  }
  const physicalRight = Math.max(500, ...Object.values(positions).map(position => position.x + 160));
  const groupNodes = nodes.filter(node => node.type === 'networkGroup');
  groupNodes.forEach((node, index) => { positions[node.id] = { x: physicalRight + 105, y: 195 + index * 280 }; });
  for (const node of nodes) { const saved = savedPositions[node.id]; if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) positions[node.id] = { x: saved.x, y: saved.y }; }
  const result = nodes.filter(node => node.data?.buildingId !== unassignedId).map(node => ({
    ...node, position: positions[node.id] || node.position, draggable: false, connectable: false,
    data: { ...node.data, overview: true, roundOverview: node.type === 'networkGroup', overviewCenter: node.id === centerId },
  }));
  const byId = new Map(result.map(node => [node.id, node]));
  const hubNeighbors = new Set([...(hub ? neighbors.get(hub.id)! : [])].map(id => `building-${id}`));
  const crossLinks = edges.filter(edge => !edge.data?.isNetworkGroupRelation && edge.source !== centerId && edge.target !== centerId && hubNeighbors.has(edge.source) && hubNeighbors.has(edge.target));
  const crossIds = new Set(crossLinks.map(edge => edge.id));
  const hiddenCrossLinks = crossLinks.filter(edge => !showCrossLinks && edge.source !== focusId && edge.target !== focusId);
  const hiddenIds = new Set(hiddenCrossLinks.map(edge => edge.id));
  const displayed = edges.filter(edge => byId.has(edge.source) && byId.has(edge.target) && !hiddenIds.has(edge.id)).map(edge => {
    const a = byId.get(edge.source)!, b = byId.get(edge.target)!;
    const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const from = horizontal ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top';
    const to = horizontal ? dx >= 0 ? 'left' : 'right' : dy >= 0 ? 'top' : 'bottom';
    const logical = !!edge.data?.isNetworkGroupRelation;
    return { ...edge, type: logical ? 'smoothstep' : 'buildingOverview', animated: false, label: logical ? undefined : edge.label,
      sourceHandle: a.type === 'networkGroup' ? null : `${from}-source`, targetHandle: b.type === 'networkGroup' ? null : `${to}-source`,
      data: { ...edge.data, routeBlocked: false, buildingRoute: undefined, labelBlocked: false, autoHideLabel: true, overviewCrossLink: crossIds.has(edge.id),
        strokeWidth: 2, strokeColor: edge.data?.strokeColor || '#64748b' },
      style: logical ? { ...edge.style, strokeWidth: 1.8 } : edge.style,
    };
  });
  return { nodes: result, edges: displayed, centerId, hiddenCrossLinks, crossLinks, positions };
}
