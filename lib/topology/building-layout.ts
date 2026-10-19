export interface BuildingPosition { x: number; y: number }

export const BUILDING_LAYOUT_KEY_PREFIX = 'network.topology.building-position:';
export const UNASSIGNED_BUILDING_NODE_ID = 'building-__unassigned-devices__';

export function isBuildingNodeId(value: unknown): value is string {
  return typeof value === 'string' && /^building-[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function isBuildingPosition(value: unknown): value is BuildingPosition {
  if (!value || typeof value !== 'object') return false;
  const position = value as BuildingPosition;
  return typeof position.x === 'number' && typeof position.y === 'number'
    && Number.isFinite(position.x) && Number.isFinite(position.y)
    && Math.abs(position.x) <= 1_000_000 && Math.abs(position.y) <= 1_000_000;
}

export function readBuildingLayout(rows: { key: string; value: string }[]): Record<string, BuildingPosition> {
  const positions: Record<string, BuildingPosition> = {};
  for (const row of rows) {
    if (!row.key.startsWith(BUILDING_LAYOUT_KEY_PREFIX)) continue;
    const nodeId = row.key.slice(BUILDING_LAYOUT_KEY_PREFIX.length);
    if (!isBuildingNodeId(nodeId)) continue;
    try {
      const position: unknown = JSON.parse(row.value);
      if (isBuildingPosition(position)) positions[nodeId] = { x: position.x, y: position.y };
    } catch { /* A corrupt position must not hide the rest of the map. */ }
  }
  return positions;
}
