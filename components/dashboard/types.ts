export type DashboardPosture = 'healthy' | 'attention' | 'critical' | 'stale';
export type IntegrationState = 'healthy' | 'stale' | 'error' | 'unconfigured';
export type DataState = 'loading' | 'ready' | 'unavailable' | 'unconfigured';

export interface PriorityIncident {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  entityType: string | null;
  entityId: string | null;
  lastSeenAt: string;
  occurrenceCount: number;
}

export interface IntegrationHealth {
  key: string;
  name: string;
  href: string;
  state: IntegrationState;
  lastSyncAt: string | null;
  message: string | null;
}

export interface DashboardSummary {
  generatedAt: string;
  posture: {
    status: DashboardPosture;
    critical: number;
    high: number;
    staleSources: number;
  };
  incidents: {
    total: number;
    critical: number;
    high: number;
    items: PriorityIncident[];
  };
  metrics: {
    devices: { total: number; healthy: number; unavailable: number };
    hosts: { total: number; healthy: number; unavailable: number };
    virtualMachines: { total: number; healthy: number; unavailable: number };
    storage: { total: number; capacityTB: number; usedTB: number; usedPercent: number | null };
    nms: { total: number; healthy: number; unavailable: number };
    firewallPolicies: number;
  };
  inventory: { clusters: number };
  integrations: IntegrationHealth[];
  operations: {
    infrastructure: {
      problemHosts: Array<{ id: string; name: string; status: string; cpuCores: number | null; memoryGB: number | null }>;
      criticalDatastores: Array<{ id: string; name: string; usedPercent: number }>;
      oldSnapshots: Array<{ id: string; name: string; vmName: string; ageInDays: number; sizeGB: number | null }>;
    };
    network: {
      offlineDevices: Array<{ id: string; name: string; status: string; managementIp: string | null; lastPolledAt: string | null }>;
      networkDeviceTypes: string[];
    };
  };
}

export interface IpsecTunnel {
  name: string;
  status: string;
  rgwy?: string;
}

export interface SslVpnUser {
  user_name: string;
  remote_host: string;
  duration: number;
  in_bytes: number;
  out_bytes: number;
}

export interface LiveDashboardData {
  ipsec: { state: DataState; items: IpsecTunnel[] };
  sslVpn: { state: DataState; users: SslVpnUser[] };
  quarantine: { state: DataState; count: number | null };
}
