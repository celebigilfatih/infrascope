export type FirewallMonitoringMode = 'FULL' | 'LIMITED' | 'UNAVAILABLE';
export type FirewallSourceStatus = 'available' | 'stale' | 'unavailable' | 'unconfigured';

export type FirewallCapability = {
  source: 'fortigate-rest' | 'fortianalyzer' | 'event-cache' | 'snmp' | 'ssh' | 'database';
  status: FirewallSourceStatus;
  checkedAt: string;
  lastSuccessAt: string | null;
  capabilities: string[];
  errorCode?: string;
  reason?: string;
  nextProbeAt?: string | null;
};

export type FirewallInventoryDevice = {
  id: string;
  name: string;
  type: string;
  vendor: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  status: string;
  criticality: string;
  managementIp: string | null;
  nmsDeviceId?: number | null;
  snmpVersion?: string | null;
  pollingEnabled?: boolean;
  pollingInterval?: number | null;
  sshUsername?: string | null;
  sshHostKeyFingerprint?: string | null;
};

export type FirewallListItem = {
  id: string | null;
  configId: string;
  name: string;
  host: string;
  vdom: string;
  enabled: boolean;
  credentialSet: boolean;
  identity: null | {
    status: string;
    serialNumber: string | null;
    analyzerDeviceId: string | null;
    identityKey: string | null;
    candidateKey: string | null;
    conflictWithId: string | null;
  };
  monitoring: null | {
    mode: FirewallMonitoringMode;
    sources: FirewallCapability[];
    lastProbeAt: string | null;
    lastSuccessAt: string | null;
    nextProbeAt: string | null;
    lastErrorCode: string | null;
  };
  device: FirewallInventoryDevice | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  requiresInventoryLink: boolean;
};

export type FirewallDetail = {
  id: string;
  deviceId: string;
  integrationConfigId: string;
  managementHost: string;
  serialNumber: string | null;
  analyzerDeviceId: string | null;
  vdom: string;
  identityKey: string | null;
  identityCandidateKey: string | null;
  identityStatus: string;
  identityConflictWithId: string | null;
  monitoringMode: FirewallMonitoringMode;
  capabilities: FirewallCapability[] | null;
  writeEnabled: boolean;
  lastProbeAt: string | null;
  lastSuccessAt: string | null;
  nextProbeAt: string | null;
  lastErrorCode: string | null;
  device: FirewallInventoryDevice & {
    sshPort?: number | null;
    sshHostKeyAlgorithm?: string | null;
  };
  integrationConfig: {
    id: string;
    name: string;
    enabled: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
  };
  tls: {
    configured: boolean;
    updatedAt: string | null;
    summary: null | {
      certificateCount: number;
      subjects: string[];
      validUntil: string;
      fingerprint: string;
    };
  };
  conflict: null | {
    id: string;
    deviceId: string;
    managementHost: string;
    serialNumber: string | null;
    vdom: string;
  };
};

export type FirewallEnvelope = {
  data: unknown;
  source: string;
  status: 'available' | 'stale' | 'unavailable';
  collectedAt: string | null;
  unavailableReason?: string;
  errorCode?: string;
  retryable?: boolean;
};
