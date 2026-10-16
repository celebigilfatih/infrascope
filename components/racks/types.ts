import type { LocationDevice } from '@/components/locations/types';

export interface RackRoom {
  id: string;
  name: string;
  floor?: { name?: string; building?: { name: string } };
}

export interface RackRecord {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  operationalStatus: string;
  position: string | null;
  room: RackRoom | null;
  devices: LocationDevice[];
}
