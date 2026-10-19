export interface BuildingEndpoints {
  sourceBuildingId: string;
  destBuildingId: string;
}

export function buildingConnectionDraft(
  connection: { source: string | null; target: string | null },
  buildingIds: string[],
): BuildingEndpoints | null {
  const sourceBuildingId = buildingIds.find(id => `building-${id}` === connection.source);
  const destBuildingId = buildingIds.find(id => `building-${id}` === connection.target);
  if (!sourceBuildingId || !destBuildingId || sourceBuildingId === destBuildingId) return null;
  return { sourceBuildingId, destBuildingId };
}

export function matchingBuildingConnection<T extends BuildingEndpoints & { connectionType: string; id: string }>(
  connections: T[], endpoints: BuildingEndpoints, connectionType: string, ignoreId?: string,
): T | undefined {
  return connections.find(link => link.id !== ignoreId && link.connectionType === connectionType && (
    (link.sourceBuildingId === endpoints.sourceBuildingId && link.destBuildingId === endpoints.destBuildingId)
    || (link.sourceBuildingId === endpoints.destBuildingId && link.destBuildingId === endpoints.sourceBuildingId)
  ));
}

// Center the most connected building; keep unassigned devices outside the physical graph.
export function buildingGraphPositions(ids: string[], connections: BuildingEndpoints[], compact: boolean, unassignedId: string, preferredCenterId?: string) {
  const positions: Record<string, { x: number; y: number }> = {};
  const buildings = ids.filter(id => id !== unassignedId);
  const degree = new Map(buildings.map(id => [id, 0]));
  for (const link of connections) {
    if (!degree.has(link.sourceBuildingId) || !degree.has(link.destBuildingId) || link.sourceBuildingId === link.destBuildingId) continue;
    degree.set(link.sourceBuildingId, degree.get(link.sourceBuildingId)! + 1);
    degree.set(link.destBuildingId, degree.get(link.destBuildingId)! + 1);
  }
  const hub = buildings.reduce<string | undefined>((best, id) => !best || degree.get(id)! > degree.get(best)! ? id : best, undefined);
  const center = preferredCenterId && buildings.includes(preferredCenterId)
    ? preferredCenterId : hub && degree.get(hub)! > 1 ? hub : undefined;
  if (center) positions[center] = { x: 0, y: 0 };
  const others = buildings.filter(id => id !== center);
  if (!center && ids.length <= 4) {
    ids.forEach((id, index) => { positions[id] = compact ? { x: 0, y: index * 152 } : { x: index * 260, y: 0 }; });
    return positions;
  }
  let placed = 0;
  let ring = 1;
  while (placed < others.length) {
    const count = Math.min(ring * 8, others.length - placed);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      positions[others[placed + i]] = { x: Math.round(Math.cos(angle) * 300 * ring), y: Math.round(Math.sin(angle) * 190 * ring) };
    }
    placed += count;
    ring++;
  }
  if (ids.includes(unassignedId)) positions[unassignedId] = { x: 300 * Math.max(1, ring - 1) + 210, y: 0 };
  return positions;
}
