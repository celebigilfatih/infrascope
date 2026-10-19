import { isBuildingPosition, type BuildingPosition } from './building-layout';
import type { TopologyConnection } from './workspace';

export const DEVICE_LAYOUT_KEY_PREFIX = 'network.topology.building-device-position:';
export type DevicePositions = Record<string, BuildingPosition>;
export const DEVICE_NODE_WIDTH = 140;
export const DEVICE_NODE_HEIGHT = 110;
export const DEVICE_COLUMN_GAP = 220;
export const DEVICE_ROW_GAP = 180;
export const DEVICE_READABLE_ZOOM = .75;

function deviceGroups(ids: string[], connections: TopologyConnection[]) {
  const neighbors = new Map([...new Set(ids)].sort().map(id => [id, new Set<string>()]));
  for (const link of connections) {
    if (link.sourceDeviceId === link.targetDeviceId || !neighbors.has(link.sourceDeviceId) || !neighbors.has(link.targetDeviceId)) continue;
    neighbors.get(link.sourceDeviceId)!.add(link.targetDeviceId);
    neighbors.get(link.targetDeviceId)!.add(link.sourceDeviceId);
  }
  const compare = (a: string, b: string) => neighbors.get(b)!.size - neighbors.get(a)!.size || (a < b ? -1 : a > b ? 1 : 0);
  const visited = new Set<string>(), groups: string[][] = [], isolated: string[] = [];
  for (const root of [...neighbors.keys()].sort(compare)) {
    if (visited.has(root)) continue;
    if (!neighbors.get(root)!.size) { isolated.push(root); continue; }
    const group = [root]; visited.add(root);
    for (let index = 0; index < group.length; index++) {
      for (const peer of [...neighbors.get(group[index])!].sort(compare)) {
        if (!visited.has(peer)) { visited.add(peer); group.push(peer); }
      }
    }
    groups.push(group);
  }
  groups.sort((a, b) => b.length - a.length || compare(a[0], b[0]));
  return { groups, isolated };
}

// Breadth-first neighbors occupy successive cells around the hub. Unlike a
// layered tree, a long chain or a high-degree switch cannot create a tall strip.
function compactGroup(ids: string[], spiral: boolean): DevicePositions {
  const positions: DevicePositions = Object.create(null);
  const columns = Math.ceil(Math.sqrt(ids.length * DEVICE_ROW_GAP / DEVICE_COLUMN_GAP * 1.5));
  let x = 0, y = 0, dx = 1, dy = 0, length = 1, step = 0, turns = 0;
  ids.forEach((id, index) => {
    positions[id] = { x: (spiral ? x : index % columns) * DEVICE_COLUMN_GAP, y: (spiral ? y : Math.floor(index / columns)) * DEVICE_ROW_GAP };
    x += dx; y += dy;
    if (++step === length) { step = 0; [dx, dy] = [-dy, dx]; if (++turns % 2 === 0) length++; }
  });
  const minX = Math.min(...Object.values(positions).map(p => p.x)), minY = Math.min(...Object.values(positions).map(p => p.y));
  for (const p of Object.values(positions)) { p.x -= minX; p.y -= minY; }
  return { ...positions };
}

export function defaultBuildingDevicePositions(ids: string[], connections: TopologyConnection[]): DevicePositions {
  const { groups, isolated } = deviceGroups(ids, connections);
  const blocks = [...groups.map(group => compactGroup(group, true)), ...(isolated.length ? [compactGroup(isolated, false)] : [])].map(positions => ({
    positions, width: Math.max(...Object.values(positions).map(p => p.x)) + DEVICE_NODE_WIDTH,
    height: Math.max(...Object.values(positions).map(p => p.y)) + DEVICE_NODE_HEIGHT,
  }));
  if (!blocks.length) return {};
  const gutter = 140;
  const shelfWidth = Math.max(...blocks.map(b => b.width), Math.sqrt(blocks.reduce((area, b) => area + (b.width + gutter) * (b.height + gutter), 0) * 1.5));
  const positions: DevicePositions = Object.create(null);
  let x = 0, y = 0, shelfHeight = 0;
  for (const block of blocks) {
    if (x && x + block.width > shelfWidth) { x = 0; y += shelfHeight + gutter; shelfHeight = 0; }
    for (const [id, p] of Object.entries(block.positions)) positions[id] = { x: p.x + x, y: p.y + y };
    x += block.width + gutter; shelfHeight = Math.max(shelfHeight, block.height);
  }
  return { ...positions };
}

// Saved positions are authoritative. Only move new, automatically placed icons
// out of their way; adding inventory must not move an existing manual layout.
export function mergeBuildingDevicePositions(defaults: DevicePositions, saved: DevicePositions): DevicePositions {
  const result: DevicePositions = Object.create(null);
  const occupied: BuildingPosition[] = [];
  for (const id of Object.keys(defaults)) if (saved[id]) { result[id] = saved[id]; occupied.push(saved[id]); }
  for (const [id, original] of Object.entries(defaults)) {
    if (result[id]) continue;
    let p = original;
    while (occupied.some(other => Math.abs(p.x - other.x) < DEVICE_NODE_WIDTH + 32 && Math.abs(p.y - other.y) < DEVICE_NODE_HEIGHT + 24)) {
      p = { x: p.x + DEVICE_COLUMN_GAP, y: p.y };
    }
    result[id] = p; occupied.push(p);
  }
  return result;
}

export function buildingDeviceFocusIds(ids: string[], connections: TopologyConnection[]): string[] {
  const { groups, isolated } = deviceGroups(ids, connections);
  return groups[0] || isolated;
}

export function buildingDeviceViewport(positions: DevicePositions, focusIds: string[], width: number, height: number, overview = false) {
  const entries = Object.entries(positions);
  if (!entries.length) return { x: 0, y: 0, zoom: 1 };
  const bounds = (points: BuildingPosition[]) => {
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(...points.map(p => p.x)) + DEVICE_NODE_WIDTH - x, height: Math.max(...points.map(p => p.y)) + DEVICE_NODE_HEIGHT - y };
  };
  const availableWidth = Math.max(120, width - 96), availableHeight = Math.max(120, height - 210);
  const scale = (box: ReturnType<typeof bounds>) => Math.min(1, availableWidth / (box.width * 1.15), availableHeight / (box.height * 1.15));
  let box = bounds(entries.map(([, p]) => p));
  if (!overview && scale(box) < DEVICE_READABLE_ZOOM) {
    const root = positions[focusIds[0]] || entries[0][1];
    const distance = (p: BuildingPosition) => (p.x - root.x) ** 2 + (p.y - root.y) ** 2;
    const local = focusIds.filter(id => positions[id]).sort((a, b) => distance(positions[a]) - distance(positions[b])).slice(0, 9);
    box = bounds(local.length ? local.map(id => positions[id]) : [root]);
  }
  const zoom = Math.max(overview ? .05 : DEVICE_READABLE_ZOOM, scale(box));
  return { x: width / 2 - (box.x + box.width / 2) * zoom, y: (height + 50) / 2 - (box.y + box.height / 2) * zoom, zoom };
}
export function isLayoutId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/.test(value);
}
export function deviceLayoutPrefix(buildingId: string) {
  return `${DEVICE_LAYOUT_KEY_PREFIX}${buildingId}:`;
}
export function readDeviceLayout(buildingId: string, rows: { key: string; value: string }[]): DevicePositions {
  const positions: DevicePositions = Object.create(null);
  const prefix = deviceLayoutPrefix(buildingId);
  for (const row of rows) {
    const id = row.key.slice(prefix.length);
    if (!row.key.startsWith(prefix) || !isLayoutId(id)) continue;
    try {
      const position: unknown = JSON.parse(row.value);
      if (isBuildingPosition(position)) positions[id] = { x: position.x, y: position.y };
    } catch { /* Ignore a corrupt row without losing the other device positions. */ }
  }
  return positions;
}
