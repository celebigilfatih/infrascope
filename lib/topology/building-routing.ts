import type { BuildingPosition } from './building-layout';
import { routeTopologyConnections, type RoutingGeometry, type TopologyRoute } from './device-routing';

// BuildingNode: 128px wide, 56px icon, two name lines and a device-count line.
export const BUILDING_ROUTING_GEOMETRY: RoutingGeometry = { width: 128, height: 116, iconLeft: 36, iconRight: 92, iconCenterX: 64, iconCenterY: 28 };

export function routeBuildingConnections(positions: Record<string, BuildingPosition>, connections: { id: string; source: string; target: string }[], optimize = true) {
  return routeTopologyConnections(positions, connections.map(link => ({ id: link.id, sourceDeviceId: link.source, targetDeviceId: link.target })), BUILDING_ROUTING_GEOMETRY, optimize);
}

export function buildingMapViewport(positions: Record<string, BuildingPosition>, routes: TopologyRoute[], width: number, height: number, top: number, bottom = 60) {
  const points = [...Object.values(positions).flatMap(p => [p, { x: p.x + BUILDING_ROUTING_GEOMETRY.width, y: p.y + BUILDING_ROUTING_GEOMETRY.height }]), ...routes.flatMap(route => route.points)];
  if (!points.length) return { x: 0, y: 0, zoom: 1 };
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const availableHeight = Math.max(80, height - top - bottom);
  const zoom = Math.max(.05, Math.min(1, Math.max(80, width - 64) / Math.max(1, maxX - minX), availableHeight / Math.max(1, maxY - minY)));
  return { x: width / 2 - (minX + maxX) / 2 * zoom, y: top + availableHeight / 2 - (minY + maxY) / 2 * zoom, zoom };
}
