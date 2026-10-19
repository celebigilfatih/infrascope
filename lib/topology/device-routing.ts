import { DEVICE_NODE_HEIGHT, DEVICE_NODE_WIDTH, type DevicePositions } from './building-device-layout';
import type { TopologyConnection } from './workspace';

export interface RoutePoint { x: number; y: number }
interface Obstacle extends RoutePoint { id: string; right: number; bottom: number }
interface Segment { a: RoutePoint; b: RoutePoint }
interface Port { anchor: RoutePoint; exit: RoutePoint }
export interface TopologyRoute {
  points: RoutePoint[];
  path: string;
  label: RoutePoint;
}
export type DeviceRoute = TopologyRoute;
export interface DeviceRoutes { routes: Record<string, DeviceRoute>; blockedIds: string[] }
export interface RoutingGeometry { width: number; height: number; iconLeft: number; iconRight: number; iconCenterX: number; iconCenterY: number }
const DEVICE_GEOMETRY: RoutingGeometry = { width: DEVICE_NODE_WIDTH, height: DEVICE_NODE_HEIGHT, iconLeft: 46, iconRight: 94, iconCenterX: 70, iconCenterY: 24 };
const CLEARANCE = 18;
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const distance = (a: RoutePoint, b: RoutePoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a: RoutePoint, b: RoutePoint) => a.x === b.x && a.y === b.y;
const between = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
const segments = (points: RoutePoint[]): Segment[] => points.slice(1).map((b, i) => ({ a: points[i], b }));

export function segmentCrossesDevice(a: RoutePoint, b: RoutePoint, rect: { x: number; y: number; right: number; bottom: number }): boolean {
  if (a.y === b.y) return a.y > rect.y && a.y < rect.bottom && Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.right;
  return a.x > rect.x && a.x < rect.right && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.bottom;
}

function intersection(a: Segment, b: Segment): RoutePoint | null {
  if ((a.a.y === a.b.y) === (b.a.y === b.b.y)) return null;
  const h = a.a.y === a.b.y ? a : b, v = h === a ? b : a;
  return between(v.a.x, h.a.x, h.b.x) && between(h.a.y, v.a.y, v.b.y) ? { x: v.a.x, y: h.a.y } : null;
}
function overlap(a: Segment, b: Segment): number {
  if (a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y) return Math.max(0, Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)));
  if (a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x) return Math.max(0, Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)));
  return 0;
}
function simplify(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (result.length && same(result[result.length - 1], point)) continue;
    while (result.length > 1) {
      const a = result[result.length - 2], b = result[result.length - 1];
      if ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)) result.pop();
      else break;
    }
    if (!result.length || !same(result[result.length - 1], point)) result.push(point);
  }
  return result;
}
export function roundedDevicePath(points: RoutePoint[]): string {
  if (!points.length) return '';
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const radius = Math.min(8, distance(a, b) / 2, distance(b, c) / 2);
    const before = { x: b.x + Math.sign(a.x - b.x) * radius, y: b.y + Math.sign(a.y - b.y) * radius };
    const after = { x: b.x + Math.sign(c.x - b.x) * radius, y: b.y + Math.sign(c.y - b.y) * radius };
    path += ` L ${before.x},${before.y} Q ${b.x},${b.y} ${after.x},${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x},${last.y}`;
}

class MinHeap {
  private items: { state: number; cost: number; estimate: number }[] = [];
  push(item: typeof this.items[number]) {
    let i = this.items.length; this.items.push(item);
    while (i) { const parent = (i - 1) >> 1; if (this.items[parent].estimate <= item.estimate) break; this.items[i] = this.items[parent]; i = parent; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].estimate < this.items[child].estimate) child++;
        if (last.estimate <= this.items[child].estimate) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
  get size() { return this.items.length; }
}

function ports(rect: Obstacle, obstacles: Obstacle[], geometry: RoutingGeometry): Port[] {
  // Side exits use the empty space beside the icon. A bottom exit would run
  // through its name and supporting text, so it is deliberately excluded.
  return [
    { anchor: { x: rect.x + geometry.iconLeft, y: rect.y + geometry.iconCenterY }, exit: { x: rect.x - CLEARANCE, y: rect.y + geometry.iconCenterY } },
    { anchor: { x: rect.x + geometry.iconRight, y: rect.y + geometry.iconCenterY }, exit: { x: rect.right + CLEARANCE, y: rect.y + geometry.iconCenterY } },
    { anchor: { x: rect.x + geometry.iconCenterX, y: rect.y }, exit: { x: rect.x + geometry.iconCenterX, y: rect.y - CLEARANCE } },
  ].filter(port => !obstacles.some(other => other.id !== rect.id && segmentCrossesDevice(port.anchor, port.exit, other)));
}

function routingGrid(obstacles: Obstacle[], endpoints: Obstacle[], geometry: RoutingGeometry) {
  const xs = new Set<number>(), ys = new Set<number>();
  const minX = Math.min(...endpoints.map(p => p.x)) - 100, maxX = Math.max(...endpoints.map(p => p.right)) + 100;
  const minY = Math.min(...endpoints.map(p => p.y)) - 100, maxY = Math.max(...endpoints.map(p => p.bottom)) + 100;
  const relevant = obstacles.filter(p => p.right + CLEARANCE >= minX && p.x - CLEARANCE <= maxX && p.bottom + CLEARANCE >= minY && p.y - CLEARANCE <= maxY);
  const addX = (x: number) => { if (x >= minX && x <= maxX) xs.add(x); };
  const addY = (y: number) => { if (y >= minY && y <= maxY) ys.add(y); };
  xs.add(minX); xs.add(maxX); ys.add(minY); ys.add(maxY);
  for (const p of relevant) {
    for (const gap of [CLEARANCE, CLEARANCE + 14]) { addX(p.x - gap); addX(p.right + gap); addY(p.y - gap); addY(p.bottom + gap); }
    addX(p.x + geometry.iconCenterX); addY(p.y + geometry.iconCenterY);
  }
  const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b), columns = x.length;
  const expanded = relevant.map(p => ({ ...p, x: p.x - CLEARANCE, y: p.y - CLEARANCE, right: p.right + CLEARANCE, bottom: p.bottom + CLEARANCE }));
  const clear = (a: RoutePoint, b: RoutePoint) => !expanded.some(rect => segmentCrossesDevice(a, b, rect));
  const neighbors = new Map<number, { id: number; length: number; direction: number }[]>();
  const point = (id: number) => ({ x: x[id % columns], y: y[Math.floor(id / columns)] });
  const index = (p: RoutePoint) => { const column = x.indexOf(p.x), row = y.indexOf(p.y); return column < 0 || row < 0 ? -1 : row * columns + column; };
  return {
    point, index,
    adjacent: (id: number) => {
      if (neighbors.has(id)) return neighbors.get(id)!;
      const row = Math.floor(id / columns), column = id % columns, a = point(id), result = [];
      for (const next of [column > 0 ? id - 1 : -1, column + 1 < columns ? id + 1 : -1, row > 0 ? id - columns : -1, row + 1 < y.length ? id + columns : -1]) {
        if (next < 0) continue;
        const b = point(next);
        if (clear(a, b)) result.push({ id: next, length: distance(a, b), direction: a.y === b.y ? 1 : 2 });
      }
      neighbors.set(id, result); return result;
    },
  };
}

function findRoute(grid: ReturnType<typeof routingGrid>, sources: Port[], targets: Port[], occupied: Segment[]): DeviceRoute | null {
  const targetIds = new Map(targets.map(port => [grid.index(port.exit), port]).filter(([id]) => id !== -1) as [number, Port][]);
  const sourceIds = new Map(sources.map(port => [grid.index(port.exit), port]).filter(([id]) => id !== -1) as [number, Port][]);
  if (!sourceIds.size || !targetIds.size) return null;
  const heuristic = (point: RoutePoint) => Math.min(...targets.map(port => distance(point, port.exit) + distance(port.anchor, port.exit)));
  const heap = new MinHeap(), costs = new Map<number, number>(), previous = new Map<number, number>();
  for (const [id, port] of sourceIds) {
    const state = id * 3 + (port.anchor.y === port.exit.y ? 1 : 2), cost = distance(port.anchor, port.exit);
    costs.set(state, cost); heap.push({ state, cost, estimate: cost + heuristic(port.exit) });
  }
  let end = -1, best = Infinity;
  while (heap.size) {
    const current = heap.pop()!;
    if (current.estimate >= best) break;
    if (costs.get(current.state) !== current.cost) continue;
    const id = Math.floor(current.state / 3), direction = current.state % 3, a = grid.point(id), target = targetIds.get(id);
    if (target) {
      const cost = current.cost + distance(target.anchor, target.exit) + (direction !== (target.anchor.y === target.exit.y ? 1 : 2) ? 28 : 0);
      if (cost < best) { best = cost; end = current.state; }
    }
    for (const next of grid.adjacent(id)) {
      const b = grid.point(next.id), segment = { a, b };
      const conflicts = occupied.reduce((sum, old) => sum + (intersection(segment, old) ? 180 : 0) + overlap(segment, old) * 3, 0);
      const cost = current.cost + next.length + (direction !== next.direction ? 28 : 0) + conflicts;
      const state = next.id * 3 + next.direction;
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost); previous.set(state, current.state);
      heap.push({ state, cost, estimate: cost + heuristic(b) });
    }
  }
  if (end < 0) return null;
  const points = [grid.point(Math.floor(end / 3))];
  for (let state = end; previous.has(state);) { state = previous.get(state)!; points.push(grid.point(Math.floor(state / 3))); }
  points.reverse();
  const first = sourceIds.get(grid.index(points[0]))!, last = targetIds.get(grid.index(points[points.length - 1]))!;
  const simplified = simplify([first.anchor, ...points, last.anchor]);
  if (simplified.length < 2 || same(simplified[0], simplified[simplified.length - 1])) return null;
  const longest = segments(simplified).sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
  return { points: simplified, path: roundedDevicePath(simplified), label: { x: (longest.a.x + longest.b.x) / 2, y: (longest.a.y + longest.b.y) / 2 } };
}

export function countDeviceRouteCrossings(routes: Record<string, DeviceRoute>): number {
  const values = Object.values(routes); let count = 0;
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const seen = new Set<string>();
    for (const a of segments(values[i].points)) for (const b of segments(values[j].points)) {
      const point = intersection(a, b);
      if (!point || [values[i], values[j]].some(route => same(point, route.points[0]) || same(point, route.points[route.points.length - 1]))) continue;
      seen.add(`${point.x}:${point.y}`);
    }
    count += seen.size;
  }
  return count;
}

export function routeBuildingDeviceConnections(positions: DevicePositions, connections: Pick<TopologyConnection, 'id' | 'sourceDeviceId' | 'targetDeviceId'>[], optimize = true): DeviceRoutes {
  return routeTopologyConnections(positions, connections, DEVICE_GEOMETRY, optimize);
}

export function routeTopologyConnections(positions: DevicePositions, connections: Pick<TopologyConnection, 'id' | 'sourceDeviceId' | 'targetDeviceId'>[], geometry: RoutingGeometry, optimize = true): DeviceRoutes {
  const obstacles = Object.entries(positions).sort(([a], [b]) => compareIds(a, b)).map(([id, p]) => ({ id, ...p, right: p.x + geometry.width, bottom: p.y + geometry.height }));
  const byId = new Map(obstacles.map(p => [p.id, p]));
  const links = connections.filter(link => link.sourceDeviceId !== link.targetDeviceId && byId.has(link.sourceDeviceId) && byId.has(link.targetDeviceId)).sort((a, b) => distance(byId.get(a.sourceDeviceId)!, byId.get(a.targetDeviceId)!) - distance(byId.get(b.sourceDeviceId)!, byId.get(b.targetDeviceId)!) || compareIds(a.id, b.id));
  if (!links.length) return { routes: {}, blockedIds: [] };
  const endpointIds = new Set(links.flatMap(link => [link.sourceDeviceId, link.targetDeviceId]));
  const grid = routingGrid(obstacles, obstacles.filter(p => endpointIds.has(p.id)), geometry);
  const allPorts = new Map([...endpointIds].map(id => [id, ports(byId.get(id)!, obstacles, geometry)]));
  const run = (order: typeof links) => {
    const routes: Record<string, DeviceRoute> = Object.create(null);
    const occupied: Segment[] = [], blockedIds: string[] = [];
    for (const link of order) {
      const route = findRoute(grid, allPorts.get(link.sourceDeviceId)!, allPorts.get(link.targetDeviceId)!, occupied);
      if (route) { routes[link.id] = route; occupied.push(...segments(route.points)); }
      else blockedIds.push(link.id);
    }
    return { routes, blockedIds };
  };
  const first = run(links);
  if (!optimize || links.length > 40 || !countDeviceRouteCrossings(first.routes)) return first;
  const second = run([...links].reverse());
  const score = (result: DeviceRoutes) => result.blockedIds.length * 1e9 + countDeviceRouteCrossings(result.routes) * 1e6 + Object.values(result.routes).reduce((sum, route) => sum + segments(route.points).reduce((n, s) => n + distance(s.a, s.b), 0) + route.points.length * 28, 0);
  let best = score(second) < score(first) ? second : first;
  // Revisit long routes after their neighbors are known. Accept a replacement
  // only when the complete map improves, so reducing one crossing cannot add
  // several elsewhere. Skip this extra pass during a drag and on large graphs.
  for (const link of [...links].reverse()) {
    const occupied = Object.entries(best.routes).filter(([id]) => id !== link.id).flatMap(([, route]) => segments(route.points));
    const route = findRoute(grid, allPorts.get(link.sourceDeviceId)!, allPorts.get(link.targetDeviceId)!, occupied);
    if (!route) continue;
    const candidate = { ...best, routes: { ...best.routes, [link.id]: route } };
    if (score(candidate) < score(best)) best = candidate;
  }
  return best;
}
