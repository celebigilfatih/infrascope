export interface LocationDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality?: string;
  healthScore?: number | null;
  lastPolledAt?: string | null;
  rackUnitPosition: number | null;
  vendor?: string | null;
  model?: string | null;
  metadata?: unknown;
}

export interface LocationRack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  operationalStatus: string;
  roomId?: string;
  coordX?: number | null;
  coordY?: number | null;
  coordZ?: number | null;
  rotation?: number | null;
  devices?: LocationDevice[];
  deviceCount?: number;
  problemDeviceCount?: number;
  totalUnits?: number;
  usedUnits?: number;
  availableUnits?: number;
  utilization?: number;
  unpositionedDevices?: number;
  conflictDevices?: number;
  isAutoPositioned?: boolean;
  _count?: { devices?: number };
}

export interface LocationRoom {
  id: string;
  name: string;
  description?: string | null;
  floorId?: string;
  capacity?: number | null;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  racks?: LocationRack[];
}

export interface LocationFloor {
  id: string;
  name: string;
  floorNumber: number;
  buildingId: string;
  rooms?: LocationRoom[];
}

export interface LocationBuilding {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  organizationId: string;
  floors?: LocationFloor[];
}

export interface LocationOrganization {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  buildings?: LocationBuilding[];
}

export interface RoomPortfolioSummary {
  id: string;
  name: string;
  description?: string | null;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  floor: {
    id: string;
    name: string;
    floorNumber: number;
    building: {
      id: string;
      name: string;
      city?: string | null;
      organization: { id: string; name: string };
    };
  };
  rackCount: number;
  deviceCount: number;
  problemDeviceCount: number;
  unpositionedDeviceCount: number;
  conflictDeviceCount: number;
  totalUnits: number;
  usedUnits: number;
  utilization: number;
  status: 'HEALTHY' | 'PLANNING' | 'ATTENTION';
  racks: LocationRack[];
}

export interface LocationsSummary {
  totals: {
    organizations: number;
    buildings: number;
    rooms: number;
    racks: number;
    devices: number;
    problemDevices: number;
    unpositionedDevices: number;
    totalUnits: number;
    usedUnits: number;
    utilization: number;
  };
  rooms: RoomPortfolioSummary[];
}
