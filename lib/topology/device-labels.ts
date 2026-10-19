import { DEVICE_NODE_HEIGHT, DEVICE_NODE_WIDTH, type DevicePositions } from './building-device-layout';

interface Rect { x: number; y: number; width: number; height: number }
export interface DeviceLabelCandidate { id: string; x: number; y: number; width: number; priority?: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;

// Labels stay on their own edge. Crowded labels remain available through the
// edge tooltip instead of being displaced onto a different connection.
export function visibleDeviceLabelIds(positions: DevicePositions, candidates: DeviceLabelCandidate[]): Set<string> {
  return visibleConnectionLabelIds(positions, candidates, { width: DEVICE_NODE_WIDTH, height: DEVICE_NODE_HEIGHT });
}

export function visibleConnectionLabelIds(positions: DevicePositions, candidates: DeviceLabelCandidate[], size: { width: number; height: number }): Set<string> {
  const occupied: Rect[] = Object.values(positions).map(p => ({ ...p, ...size }));
  const visible = new Set<string>();
  for (const label of [...candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.id < b.id ? -1 : 1))) {
    const rect = { x: label.x - label.width / 2, y: label.y - 28, width: label.width, height: 56 };
    if (occupied.some(other => overlaps(rect, other))) continue;
    occupied.push(rect); visible.add(label.id);
  }
  return visible;
}
