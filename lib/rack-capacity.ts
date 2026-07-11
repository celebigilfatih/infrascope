export interface RackCapacityDevice {
  id: string;
  rackUnitPosition?: number | null;
  metadata?: unknown;
}

export interface ResolvedRackDevice<T extends RackCapacityDevice> {
  device: T;
  unitHeight: number;
  resolvedUnit: number | null;
  isAutoPositioned: boolean;
  hasConflict: boolean;
}

export interface RackCapacitySummary {
  totalUnits: number;
  usedUnits: number;
  availableUnits: number;
  utilization: number;
  positionedDevices: number;
  unpositionedDevices: number;
  conflictDevices: number;
}

function getUnitHeight(device: RackCapacityDevice, maxUnits: number) {
  const metadata = device.metadata && typeof device.metadata === 'object'
    ? device.metadata as Record<string, unknown>
    : {};
  const value = Number(metadata.unitHeight ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.min(maxUnits, Math.floor(value))) : 1;
}

export function resolveRackDevices<T extends RackCapacityDevice>(maxUnits: number, devices: T[]): ResolvedRackDevice<T>[] {
  const totalUnits = Math.max(1, Math.floor(maxUnits || 42));
  const occupied = new Map<number, string>();
  const conflicts = new Set<string>();
  const positioned = devices.filter((device) => Number.isInteger(device.rackUnitPosition) && Number(device.rackUnitPosition) > 0);
  const unpositioned = devices.filter((device) => !Number.isInteger(device.rackUnitPosition) || Number(device.rackUnitPosition) <= 0);
  const result = new Map<string, ResolvedRackDevice<T>>();

  positioned.forEach((device) => {
    const unitHeight = getUnitHeight(device, totalUnits);
    const start = Number(device.rackUnitPosition);
    let hasConflict = start + unitHeight - 1 > totalUnits;

    for (let unit = start; unit < start + unitHeight && unit <= totalUnits; unit += 1) {
      const owner = occupied.get(unit);
      if (owner) {
        conflicts.add(owner);
        hasConflict = true;
      } else {
        occupied.set(unit, device.id);
      }
    }

    if (hasConflict) conflicts.add(device.id);
    result.set(device.id, { device, unitHeight, resolvedUnit: start, isAutoPositioned: false, hasConflict });
  });

  unpositioned.forEach((device) => {
    const unitHeight = getUnitHeight(device, totalUnits);
    let resolvedUnit: number | null = null;

    for (let start = 1; start <= totalUnits - unitHeight + 1; start += 1) {
      let fits = true;
      for (let unit = start; unit < start + unitHeight; unit += 1) {
        if (occupied.has(unit)) {
          fits = false;
          break;
        }
      }
      if (fits) {
        resolvedUnit = start;
        for (let unit = start; unit < start + unitHeight; unit += 1) occupied.set(unit, device.id);
        break;
      }
    }

    const hasConflict = resolvedUnit === null;
    if (hasConflict) conflicts.add(device.id);
    result.set(device.id, { device, unitHeight, resolvedUnit, isAutoPositioned: true, hasConflict });
  });

  return devices.map((device) => {
    const item = result.get(device.id)!;
    return { ...item, hasConflict: item.hasConflict || conflicts.has(device.id) };
  });
}

export function calculateRackCapacity(maxUnits: number, devices: RackCapacityDevice[]): RackCapacitySummary {
  const totalUnits = Math.max(1, Math.floor(maxUnits || 42));
  const resolved = resolveRackDevices(totalUnits, devices);
  const occupied = new Set<number>();

  resolved.forEach((item) => {
    if (!item.resolvedUnit) return;
    for (let unit = item.resolvedUnit; unit < item.resolvedUnit + item.unitHeight && unit <= totalUnits; unit += 1) {
      occupied.add(unit);
    }
  });

  const usedUnits = occupied.size;
  return {
    totalUnits,
    usedUnits,
    availableUnits: Math.max(0, totalUnits - usedUnits),
    utilization: Math.round((usedUnits / totalUnits) * 100),
    positionedDevices: resolved.filter((item) => !item.isAutoPositioned).length,
    unpositionedDevices: resolved.filter((item) => item.isAutoPositioned).length,
    conflictDevices: resolved.filter((item) => item.hasConflict).length,
  };
}
