import type { BuildingPosition } from './building-layout';

interface Link { source: string; target: string }
interface Item { id: string; type?: string }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const distance = (a: BuildingPosition, b: BuildingPosition) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Compact, deterministic display coordinates, not a claim about physical hierarchy. */
export function compactBuildingPositions(ids: string[], links: Link[], centerId?: string): Record<string, BuildingPosition> {
  const catalog = [...new Set(ids)].sort(compare);
  if (!catalog.length) return {};
  const neighbors = new Map(catalog.map(id => [id, new Set<string>()]));
  for (const link of links) if (link.source !== link.target && neighbors.has(link.source) && neighbors.has(link.target)) {
    neighbors.get(link.source)!.add(link.target); neighbors.get(link.target)!.add(link.source);
  }
  const byDegree = (a: string, b: string) => neighbors.get(b)!.size - neighbors.get(a)!.size || compare(a, b);
  const root = centerId && neighbors.has(centerId) ? centerId : [...catalog].sort(byDegree)[0];
  const order: string[] = [], seen = new Set<string>();
  for (const start of [root, ...catalog.sort(byDegree)]) {
    if (seen.has(start)) continue;
    const queue = [start]; seen.add(start);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; order.push(id);
      for (const next of [...neighbors.get(id)!].sort(byDegree)) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(catalog.length * 1.2))), rows = Math.ceil(catalog.length / columns);
  const slots = Array.from({ length: columns * rows }, (_, i) => ({ x: (i % columns) * 240, y: Math.floor(i / columns) * 200 }));
  const middle = { x: (columns - 1) * 120, y: (rows - 1) * 100 };
  const positions: Record<string, BuildingPosition> = {}, available = new Set(slots.map((_, i) => i));
  for (const id of order) {
    const peers = [...neighbors.get(id)!].filter(peer => positions[peer]);
    const score = (p: BuildingPosition) => peers.reduce((sum, peer) => sum + distance(p, positions[peer]), 0) + distance(p, middle) * .05;
    const slot = [...available].sort((a, b) => score(slots[a]) - score(slots[b]) || a - b)[0];
    positions[id] = slots[slot]; available.delete(slot);
  }
  // Improve neighbor lengths by local swaps; fixed grid cells keep names apart.
  // Unique undirected links prevent parallel cables from biasing placement.
  const pairs = catalog.flatMap(a => [...neighbors.get(a)!].filter(b => compare(a, b) < 0).map(b => [a, b]));
  const energy = () => pairs.reduce((sum, [a, b]) => sum + distance(positions[a], positions[b]) ** 1.3, 0);
  let best = energy();
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i], b = order[j]; if (a === root || b === root) continue;
      [positions[a], positions[b]] = [positions[b], positions[a]];
      const candidate = energy();
      if (candidate + .01 < best) { best = candidate; improved = true; }
      else [positions[a], positions[b]] = [positions[b], positions[a]];
    }
    if (!improved) break;
  }
  const origin = positions[root];
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, { x: p.x - origin.x + 340, y: p.y - origin.y + 270 }]));
}

/** Used only by the explicit preview action; never writes or mutates saved data. */
export function arrangeBuildingOverview(items: Item[], links: Link[], saved: Record<string, BuildingPosition>, pinned: string[], centerId?: string) {
  const buildings = items.filter(item => item.type !== 'networkGroup');
  const positions = compactBuildingPositions(buildings.map(item => item.id), links, centerId);
  const right = Math.max(500, ...Object.values(positions).map(p => p.x + 160));
  items.filter(item => item.type === 'networkGroup').sort((a, b) => compare(a.id, b.id)).forEach((item, i) => { positions[item.id] = { x: right + 105, y: 195 + i * 280 }; });
  const shapes = new Map(items.map(item => [item.id, item.type === 'networkGroup' ? { width: 232, height: 232 } : { width: 160, height: 148 }]));
  const occupied: { id: string; point: BuildingPosition }[] = [];
  for (const id of pinned) if (saved[id] && shapes.has(id)) { positions[id] = { ...saved[id] }; occupied.push({ id, point: positions[id] }); }
  for (const item of [...items].sort((a, b) => compare(a.id, b.id))) {
    if (pinned.includes(item.id) && saved[item.id]) continue;
    const point = { ...positions[item.id] }, shape = shapes.get(item.id)!;
    while (occupied.some(other => { const size = shapes.get(other.id)!; return point.x < other.point.x + size.width + 36 && point.x + shape.width + 36 > other.point.x && point.y < other.point.y + size.height + 36 && point.y + shape.height + 36 > other.point.y; })) point.y += 200;
    positions[item.id] = point; occupied.push({ id: item.id, point });
  }
  return positions;
}
