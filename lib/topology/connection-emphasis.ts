export type ConnectionEmphasis = 'normal' | 'highlighted' | 'muted';
export interface HoveredConnection { id: string; source: string; target: string }

export function directConnectionCounts(edges: ReadonlyArray<{ source: string; target: string }>) {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
    if (edge.target !== edge.source) counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
  }
  return counts;
}

export function resolveHoveredConnection(edges: ReadonlyArray<HoveredConnection>, id?: string | null): HoveredConnection | null {
  return id ? edges.find(edge => edge.id === id) || null : null;
}

export function connectionInteractionEmphasis(edge: HoveredConnection, selectedNodeId?: string | null, hovered?: HoveredConnection | null): ConnectionEmphasis {
  return hovered ? edge.id === hovered.id ? 'highlighted' : 'muted' : connectionEmphasis(edge.source, edge.target, selectedNodeId);
}

export function nodeInteractionEmphasis(nodeId: string, selectedNodeId: string | null | undefined, connectedIds: ReadonlySet<string>, hovered?: HoveredConnection | null): ConnectionEmphasis {
  return hovered ? nodeId === hovered.source || nodeId === hovered.target ? 'highlighted' : 'muted' : nodeEmphasis(nodeId, selectedNodeId, connectedIds);
}

// A delayed leave from one tooltip must not cancel a newer connection hover.
export function nextHoveredConnection(current: string | null, id: string, active: boolean) {
  return active ? id : current === id ? null : current;
}

export function directlyConnectedNodeIds(edges: ReadonlyArray<{ source: string; target: string }>, selectedNodeId?: string | null) {
  const ids = new Set<string>();
  if (!selectedNodeId) return ids;
  ids.add(selectedNodeId);
  for (const edge of edges) {
    if (edge.source === selectedNodeId) ids.add(edge.target);
    if (edge.target === selectedNodeId) ids.add(edge.source);
  }
  return ids;
}

// Traverse either direction, but never expand connections from the outer boundary.
// In particular, depth 1 preserves the selected icon's incident connections only.
export function connectionNeighborhood<T extends { source: string; target: string }>(edges: ReadonlyArray<T>, selectedNodeId: string | null | undefined, depth: 1 | 2) {
  const distances = new Map<string, number>();
  if (!selectedNodeId) return { nodeIds: new Set<string>(), edges: [] as T[], distances };
  const adjacent = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (!adjacent.has(source)) adjacent.set(source, new Set());
    if (!adjacent.has(target)) adjacent.set(target, new Set());
    adjacent.get(source)!.add(target);
    adjacent.get(target)!.add(source);
  }
  distances.set(selectedNodeId, 0);
  const queue = [selectedNodeId];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const distance = distances.get(current)!;
    if (distance >= depth) continue;
    for (const neighbor of adjacent.get(current) || []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      queue.push(neighbor);
    }
  }
  return {
    nodeIds: new Set(distances.keys()),
    distances,
    edges: edges.filter(edge => distances.has(edge.source) && distances.has(edge.target)
      && Math.min(distances.get(edge.source)!, distances.get(edge.target)!) < depth),
  };
}

// Filter after traversal so hiding a first-hop icon cannot erase second-hop distances.
export function filterNeighborhoodByDistance<T extends { source: string; target: string }>(neighborhood: {
  nodeIds: ReadonlySet<string>; distances: ReadonlyMap<string, number>; edges: ReadonlyArray<T>;
}, hiddenDistances: ReadonlySet<number>) {
  const nodeIds = new Set([...neighborhood.nodeIds].filter(id => {
    const distance = neighborhood.distances.get(id);
    return distance === 0 || (distance !== undefined && !hiddenDistances.has(distance));
  }));
  return { ...neighborhood, nodeIds, edges: neighborhood.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)) };
}

export function nodeEmphasis(nodeId: string, selectedNodeId: string | null | undefined, connectedIds: ReadonlySet<string>): ConnectionEmphasis {
  if (!selectedNodeId) return 'normal';
  return connectedIds.has(nodeId) ? 'highlighted' : 'muted';
}

export function connectionEmphasis(source: string, target: string, selectedNodeId?: string | null): ConnectionEmphasis {
  if (!selectedNodeId) return 'normal';
  return source === selectedNodeId || target === selectedNodeId ? 'highlighted' : 'muted';
}

export function connectionEmphasisStyle(emphasis: ConnectionEmphasis | undefined, width: number, opacity = 1, engaged = false, hoverActive = false) {
  const muted = emphasis === 'muted' && (!engaged || hoverActive);
  return {
    strokeWidth: width + (emphasis === 'highlighted' ? 2 : 0),
    opacity: muted ? .18 : emphasis === 'highlighted' || (emphasis === 'muted' && engaged) ? 1 : opacity,
    labelOpacity: muted ? .4 : 1,
  };
}
