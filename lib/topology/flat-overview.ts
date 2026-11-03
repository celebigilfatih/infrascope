import type { TopologyPresentation, PresentationPoint } from './presentation';

/** Returning an empty document is a local default, never an implicit API write. */
export function flatPresentation(document: TopologyPresentation | null): TopologyPresentation {
  return document || { version: 1, sections: [], backboneIds: [], positions: {}, pinned: {} };
}

export function flatPositions(nodes: { id: string; position: PresentationPoint }[], legacy: Record<string, PresentationPoint>, document: TopologyPresentation) {
  return { ...Object.fromEntries(nodes.map(node => [node.id, node.position])), ...legacy, ...document.positions.all };
}

const READABLE_ZOOM = .75;

export function readableMapViewport(nodes: { id: string; type?: string; position: PresentationPoint }[], edges: { source: string; target: string }[], width: number, height: number, whole = false, backboneId?: string) {
  if (!nodes.length) return { x: 0, y: 0, zoom: 1 };
  const minX = Math.min(...nodes.map(n => n.position.x)), minY = Math.min(...nodes.map(n => n.position.y));
  const graphWidth = Math.max(...nodes.map(n => n.position.x + (n.type === 'networkGroup' ? 232 : 160))) - minX;
  const graphHeight = Math.max(...nodes.map(n => n.position.y + (n.type === 'networkGroup' ? 132 : 148))) - minY;
  const fitted = Math.max(.05, Math.min(1.05, (width - 56) / Math.max(graphWidth, 1), (height - 100) / Math.max(graphHeight, 1)));
  if (!whole && fitted < READABLE_ZOOM) {
    const degrees = new Map<string, Set<string>>();
    for (const e of edges) { if (!degrees.has(e.source)) degrees.set(e.source, new Set()); if (!degrees.has(e.target)) degrees.set(e.target, new Set()); degrees.get(e.source)!.add(e.target); degrees.get(e.target)!.add(e.source); }
    const backbone = nodes.find(node => node.id === backboneId);
    const hub = backbone || [...nodes].filter(n => n.type === 'building').sort((a, b) => (degrees.get(b.id)?.size || 0) - (degrees.get(a.id)?.size || 0) || a.id.localeCompare(b.id))[0] || nodes[0];
    return { x: width / 2 - (hub.position.x + 80) * READABLE_ZOOM, y: height * (backbone ? .34 : .5) - (hub.position.y + 65) * READABLE_ZOOM, zoom: READABLE_ZOOM };
  }
  return { x: (width - graphWidth * fitted) / 2 - minX * fitted, y: (height - graphHeight * fitted) / 2 - minY * fitted, zoom: fitted };
}
