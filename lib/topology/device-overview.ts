import type { Edge, Node } from 'reactflow';

export const OVERVIEW_DEVICE_WIDTH = 192;
export const OVERVIEW_DEVICE_HEIGHT = 144;
export const OVERVIEW_GROUP_SIZE = 232;

export function deviceOverviewCenterId(nodes: Node[], edges: Edge[]) {
  const neighbors = new Map(nodes.filter(node => node.type !== 'networkGroup').map(node => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.data?.isNetworkGroupRelation || edge.source === edge.target || !neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
    neighbors.get(edge.source)!.add(edge.target); neighbors.get(edge.target)!.add(edge.source);
  }
  return [...neighbors.keys()].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b))[0];
}

export function deviceNetworkEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const parallels = new Map<string, string[]>();
  for (const edge of edges) {
    const pair = [edge.source, edge.target].sort().join('|');
    if (!edge.data?.isNetworkGroupRelation) parallels.set(pair, [...(parallels.get(pair) || []), edge.id].sort());
  }
  return edges.filter(edge => byId.has(edge.source) && byId.has(edge.target)).map(edge => {
    const source = byId.get(edge.source)!, target = byId.get(edge.target)!;
    const dx = target.position.x - source.position.x, dy = target.position.y - source.position.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const logical = !!edge.data?.isNetworkGroupRelation;
    const peers = parallels.get([edge.source, edge.target].sort().join('|')) || [edge.id];
    return { ...edge, type: logical ? 'smoothstep' : 'deviceOverviewCurve', animated: false,
      sourceHandle: source.type === 'networkGroup' ? null : horizontal ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top',
      targetHandle: target.type === 'networkGroup' ? null : horizontal ? dx >= 0 ? 'left' : 'right' : dy >= 0 ? 'top' : 'bottom',
      data: { ...edge.data, deviceRoute: undefined, curveLane: (peers.indexOf(edge.id) - (peers.length - 1) / 2) * 48 * (edge.source < edge.target ? 1 : -1) },
    };
  });
}

/** A visual spanning forest; this says nothing about active/backup routing. */
export function deviceOverviewExtraEdges(nodes: Node[], edges: Edge[]) {
  const parents = new Map(nodes.map(node => [node.id, node.id]));
  const root = (id: string): string => { const parent = parents.get(id); if (!parent || parent === id) return id; const found = root(parent); parents.set(id, found); return found; };
  const extra = new Set<string>();
  for (const edge of [...edges].filter(edge => !edge.data?.isNetworkGroupRelation).sort((a, b) => a.id.localeCompare(b.id))) {
    const a = root(edge.source), b = root(edge.target);
    if (a === b) extra.add(edge.id); else parents.set(a, b);
  }
  return extra;
}

/** Summarize only verified cross-location paths and explicit group anchors. */
export function deviceOverviewSummary(nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ids = new Set<string>();
  for (const node of nodes) if (node.type === 'networkGroup') {
    ids.add(node.id);
    if (byId.has(node.data.group.sourceDeviceId)) ids.add(node.data.group.sourceDeviceId);
  }
  for (const edge of edges) {
    const a = byId.get(edge.source), b = byId.get(edge.target);
    if (!a || !b) continue;
    if (edge.data?.isNetworkGroupRelation || (a.data.buildingId && b.data.buildingId && a.data.buildingId !== b.data.buildingId)) {
      ids.add(a.id); ids.add(b.id);
    }
  }
  return { nodes: nodes.filter(node => ids.has(node.id)), edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

/** Pack connected components in two dimensions, without changing saved positions. */
export function deviceOverviewPositions(nodes: Node[], edges: Edge[], networkStyle = false) {
  const devices = nodes.filter(node => node.type !== 'networkGroup');
  const neighbors = new Map(devices.map(node => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.source === edge.target || !neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }
  const compare = (a: string, b: string) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b);
  const seen = new Set<string>(), components: string[][] = [], isolated: string[] = [];
  for (const root of [...neighbors.keys()].sort(compare)) {
    if (seen.has(root)) continue;
    if (!neighbors.get(root)!.size) { isolated.push(root); continue; }
    const component = [root]; seen.add(root);
    for (let i = 0; i < component.length; i++) {
      for (const peer of [...neighbors.get(component[i])!].sort(compare)) {
        if (!seen.has(peer)) { seen.add(peer); component.push(peer); }
      }
    }
    components.push(component);
  }
  if (isolated.length) components.push(isolated);
  const blocks = components.map(ids => {
    if (networkStyle && ids.length > 1 && ids.length <= 64) {
      const points: Record<string, { x: number; y: number }> = { [ids[0]]: { x: 0, y: 0 } };
      for (let start = 1, ring = 1; start < ids.length; ring++) {
        const peers = ids.slice(start, start + 8 * ring);
        peers.forEach((id, index) => {
          const angle = -Math.PI / 2 + index * 2 * Math.PI / peers.length;
          points[id] = { x: Math.round(Math.cos(angle) * 390 * ring), y: Math.round(Math.sin(angle) * 310 * ring) };
        });
        start += peers.length;
      }
      const minX = Math.min(...Object.values(points).map(p => p.x)), minY = Math.min(...Object.values(points).map(p => p.y));
      for (const point of Object.values(points)) { point.x -= minX; point.y -= minY; }
      return { ids, columns: 0, radial: false, points, width: Math.max(...Object.values(points).map(p => p.x)) + OVERVIEW_DEVICE_WIDTH, height: Math.max(...Object.values(points).map(p => p.y)) + OVERVIEW_DEVICE_HEIGHT };
    }
    const columns = Math.ceil(Math.sqrt(ids.length * 224 / 288 * 1.6));
    const radial = ids.length >= 4 && ids.length <= 10;
    return { ids, columns, radial, points: undefined, width: radial ? 1050 : columns * 288, height: radial ? 850 : Math.ceil(ids.length / columns) * 224 };
  });
  const shelfWidth = Math.max(0, ...blocks.map(block => block.width), Math.sqrt(blocks.reduce((sum, block) => sum + (block.width + 96) * (block.height + 96), 0) * 1.6));
  const positions: Record<string, { x: number; y: number }> = {};
  let x = 0, y = 0, height = 0;
  for (const block of blocks) {
    if (x && x + block.width > shelfWidth) { x = 0; y += height + 96; height = 0; }
    block.ids.forEach((id, index) => {
      const angle = -Math.PI / 2 + (index - 1) * 2 * Math.PI / (block.ids.length - 1);
      positions[id] = block.points ? { x: x + block.points[id].x, y: y + block.points[id].y } : block.radial ? { x: x + 425 + (index ? Math.round(Math.cos(angle) * 410) : 0), y: y + 330 + (index ? Math.round(Math.sin(angle) * 310) : 0) } : { x: x + index % block.columns * 288, y: y + Math.floor(index / block.columns) * 224 };
    });
    x += block.width + 96; height = Math.max(height, block.height);
  }
  const right = Math.max(0, ...Object.values(positions).map(position => position.x + OVERVIEW_DEVICE_WIDTH));
  const placedGroups: { x: number; y: number }[] = [];
  nodes.filter(node => node.type === 'networkGroup').sort((a, b) => a.id.localeCompare(b.id)).forEach(node => {
    const anchor = positions[node.data.group.sourceDeviceId];
    const position = { x: right + 180, y: Math.max(0, (anchor?.y || 0) - 40) };
    while (placedGroups.some(p => Math.abs(p.x - position.x) < OVERVIEW_GROUP_SIZE + 40 && Math.abs(p.y - position.y) < OVERVIEW_GROUP_SIZE + 40)) position.y += OVERVIEW_GROUP_SIZE + 48;
    positions[node.id] = position;
    placedGroups.push(positions[node.id]);
  });
  return positions;
}

export function deviceOverviewScope(nodes: Node[], edges: Edge[], location: string, focusId: string | null) {
  const scoped = nodes.filter(node => location === 'all' || (node.type === 'networkGroup' ? node.data.group.sourceDevice.buildingId : node.data.buildingId || 'unassigned') === location);
  const ids = new Set(scoped.map(node => node.id));
  const activeFocus = focusId && ids.has(focusId) ? focusId : null;
  // A focus may cross locations: retain every direct peer and every parallel link.
  const adjacent = new Set(activeFocus ? [activeFocus] : []);
  if (activeFocus) for (const edge of edges) {
    if (edge.source === activeFocus) adjacent.add(edge.target);
    if (edge.target === activeFocus) adjacent.add(edge.source);
  }
  const visible = activeFocus ? nodes.filter(node => adjacent.has(node.id)) : scoped;
  const visibleIds = new Set(visible.map(node => node.id));
  return { nodes: visible, edges: edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target) && (!activeFocus || edge.source === activeFocus || edge.target === activeFocus)) };
}
