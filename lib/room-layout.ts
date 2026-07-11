export const RACK_WIDTH_METERS = 0.6;
export const RACK_DEPTH_METERS = 1;
export const RACK_GAP_METERS = 0.6;

export interface PositionableRack {
  id: string;
  coordX?: number | null;
  coordZ?: number | null;
}

export interface RackPosition {
  x: number;
  z: number;
  isAutoPositioned: boolean;
}

export function computeRoomRackPositions(racks: PositionableRack[], roomWidth: number, roomDepth: number) {
  const width = Math.max(RACK_WIDTH_METERS, roomWidth || 10);
  const depth = Math.max(RACK_DEPTH_METERS, roomDepth || 8);
  const columns = Math.max(1, Math.floor((width - RACK_GAP_METERS) / (RACK_WIDTH_METERS + RACK_GAP_METERS)));
  const positions = new Map<string, RackPosition>();
  const occupied: RackPosition[] = [];

  racks.filter((rack) => Number.isFinite(rack.coordX) && Number.isFinite(rack.coordZ)).forEach((rack) => {
    const hasCoordinates = Number.isFinite(rack.coordX) && Number.isFinite(rack.coordZ);
    if (hasCoordinates) {
      const position = {
        x: Math.max(0, Math.min(width - RACK_WIDTH_METERS, Number(rack.coordX))),
        z: Math.max(0, Math.min(depth - RACK_DEPTH_METERS, Number(rack.coordZ))),
        isAutoPositioned: false,
      };
      positions.set(rack.id, position);
      occupied.push(position);
    }
  });

  racks.filter((rack) => !positions.has(rack.id)).forEach((rack, rackIndex) => {
    const maxRows = Math.max(1, Math.floor((depth - RACK_GAP_METERS) / (RACK_DEPTH_METERS + RACK_GAP_METERS)));
    let candidate: RackPosition | null = null;
    for (let slot = 0; slot < columns * maxRows; slot += 1) {
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const next = {
        x: Math.min(width - RACK_WIDTH_METERS, RACK_GAP_METERS + column * (RACK_WIDTH_METERS + RACK_GAP_METERS)),
        z: Math.min(depth - RACK_DEPTH_METERS, RACK_GAP_METERS + row * (RACK_DEPTH_METERS + RACK_GAP_METERS)),
        isAutoPositioned: true,
      };
      if (!occupied.some((position) => racksOverlap(next, position))) {
        candidate = next;
        break;
      }
    }
    const fallback = candidate || {
      x: Math.max(0, Math.min(width - RACK_WIDTH_METERS, (rackIndex % columns) * (RACK_WIDTH_METERS + 0.1))),
      z: Math.max(0, depth - RACK_DEPTH_METERS),
      isAutoPositioned: true,
    };
    positions.set(rack.id, fallback);
    occupied.push(fallback);
  });

  return positions;
}

export function racksOverlap(a: RackPosition, b: RackPosition, padding = 0.1) {
  return !(
    a.x + RACK_WIDTH_METERS + padding <= b.x ||
    b.x + RACK_WIDTH_METERS + padding <= a.x ||
    a.z + RACK_DEPTH_METERS + padding <= b.z ||
    b.z + RACK_DEPTH_METERS + padding <= a.z
  );
}
