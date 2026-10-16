import { calculateRackCapacity, resolveRackDevices } from '@/lib/rack-capacity';
import type { RackCapacityDevice } from '@/lib/rack-capacity';

export interface RackSegment<T> {
  start: number;
  end: number;
  devices: T[];
  hasConflict: boolean;
}

/** The elevation shows saved positions only; unassigned devices remain separate. */
export function presentRack<T extends RackCapacityDevice>(maxUnits: number, devices: T[]) {
  const capacity = calculateRackCapacity(maxUnits, devices);
  const resolved = resolveRackDevices(maxUnits, devices);
  const rows: T[][] = Array.from({ length: capacity.totalUnits }, () => []);
  resolved.forEach(({ device, unitHeight, isAutoPositioned }) => {
    if (isAutoPositioned) return;
    const start = Number(device.rackUnitPosition);
    for (let unit = start; unit < start + unitHeight && unit <= capacity.totalUnits; unit += 1) rows[unit - 1].push(device);
  });
  const conflicts = new Set(resolved.filter(item => item.hasConflict).map(item => item.device.id));
  const segments: RackSegment<T>[] = [];
  rows.forEach((occupants, index) => {
    if (occupants.length === 0) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.end === index && previous.devices.length === occupants.length && previous.devices.every((device, i) => device.id === occupants[i].id)) previous.end = index + 1;
    else segments.push({ start: index + 1, end: index + 1, devices: occupants, hasConflict: occupants.some(device => conflicts.has(device.id)) });
  });
  const assignedUsedUnits = rows.filter(row => row.length > 0).length;
  return { capacity, resolved, segments, assignedUsedUnits, estimatedUnits: capacity.usedUnits - assignedUsedUnits };
}
