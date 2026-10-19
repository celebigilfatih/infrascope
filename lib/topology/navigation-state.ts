export const TOPOLOGY_NAVIGATION_PREFIX = 'infrascope:topology:navigation:v1:';

export interface TopologyViewport { x: number; y: number; zoom: number }

export function validTopologyViewport(value: unknown): TopologyViewport | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, zoom } = value as Record<string, unknown>;
  return typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e7
    && typeof y === 'number' && Number.isFinite(y) && Math.abs(y) <= 1e7
    && typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= .05 && zoom <= 2
    ? { x, y, zoom } : null;
}

export interface MapNavigation {
  version: 1;
  buildingId: string | null;
  workspaceOpen: boolean;
  viewport?: TopologyViewport | null;
  onlyConnected?: boolean;
  connectionDepth?: 1 | 2;
  hiddenHopDistances?: (1 | 2)[];
}

export interface DeviceNavigation {
  version: 1;
  selectedDevice: string | null;
  selectedConnection: string | null;
  connectionScopeId: string | null;
  connectionHistory: string[];
  panelOpen: boolean;
  list: 'devices' | 'connections';
  overview: boolean;
  viewport?: TopologyViewport | null;
  onlyConnected?: boolean;
  connectionDepth?: 1 | 2;
  hiddenHopDistances?: (1 | 2)[];
}

export const DEFAULT_DEVICE_NAVIGATION: DeviceNavigation = {
  version: 1, selectedDevice: null, selectedConnection: null, connectionScopeId: null,
  connectionHistory: [], panelOpen: false, list: 'devices', overview: false, connectionDepth: 1,
};

const id = (value: unknown): string | null => typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null;

export function validHiddenHopDistances(value: unknown): (1 | 2)[] {
  return Array.isArray(value) ? ([1, 2] as const).filter(distance => value.includes(distance)) : [];
}

function read(scope: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(TOPOLOGY_NAVIGATION_PREFIX + scope) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) && value.version === 1 ? value : null;
  } catch { return null; }
}

export function saveTopologyNavigation(scope: string, value: MapNavigation | DeviceNavigation) {
  try { window.localStorage.setItem(TOPOLOGY_NAVIGATION_PREFIX + scope, JSON.stringify(value)); }
  catch { /* Navigation remains usable when browser storage is unavailable. */ }
}

export function readMapNavigation(): MapNavigation | null {
  const value = read('map');
  return value ? { version: 1, buildingId: id(value.buildingId), workspaceOpen: value.workspaceOpen === true, viewport: validTopologyViewport(value.viewport), onlyConnected: value.onlyConnected === true, connectionDepth: value.connectionDepth === 2 ? 2 : 1, hiddenHopDistances: validHiddenHopDistances(value.hiddenHopDistances) } : null;
}

export function readDeviceNavigation(buildingId: string): DeviceNavigation {
  const value = read(`building:${buildingId}`);
  if (!value) return DEFAULT_DEVICE_NAVIGATION;
  return {
    version: 1, selectedDevice: id(value.selectedDevice), selectedConnection: id(value.selectedConnection),
    connectionScopeId: id(value.connectionScopeId),
    connectionHistory: Array.isArray(value.connectionHistory) ? value.connectionHistory.flatMap(value => id(value) ? [id(value)!] : []).slice(-200) : [],
    panelOpen: value.panelOpen === true, list: value.list === 'connections' ? 'connections' : 'devices', overview: value.overview === true,
    viewport: validTopologyViewport(value.viewport),
    onlyConnected: value.onlyConnected === true,
    connectionDepth: value.connectionDepth === 2 ? 2 : 1,
    hiddenHopDistances: validHiddenHopDistances(value.hiddenHopDistances),
  };
}

// Validate only against a successfully loaded inventory, never an empty loading state.
export function validDeviceNavigation(value: DeviceNavigation, deviceIds: ReadonlySet<string>, connectionIds: ReadonlySet<string>): DeviceNavigation {
  const connectionScopeId = value.connectionScopeId && deviceIds.has(value.connectionScopeId) ? value.connectionScopeId : null;
  const selectedConnection = value.selectedConnection && connectionIds.has(value.selectedConnection) ? value.selectedConnection : null;
  const selectedDevice = value.selectedDevice && deviceIds.has(value.selectedDevice) ? value.selectedDevice : selectedConnection ? null : connectionScopeId;
  return {
    ...value, selectedDevice, selectedConnection, connectionScopeId,
    connectionHistory: connectionScopeId ? value.connectionHistory.filter(id => deviceIds.has(id)).slice(-200) : [],
    list: connectionScopeId ? 'connections' : value.list,
    onlyConnected: !!value.onlyConnected && !!(selectedDevice || connectionScopeId),
    connectionDepth: value.connectionDepth === 2 ? 2 : 1,
    hiddenHopDistances: validHiddenHopDistances(value.hiddenHopDistances),
  };
}
