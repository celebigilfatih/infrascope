import type { FirewallErrorCode } from './errors';

export type FirewallMonitoringMode = 'FULL' | 'LIMITED' | 'UNAVAILABLE';
export type FirewallDataStatus = 'available' | 'stale' | 'unavailable';
export type FirewallCapabilityStatus = FirewallDataStatus | 'unconfigured';
export type FirewallDataSource =
  | 'fortigate-rest'
  | 'fortianalyzer'
  | 'event-cache'
  | 'snmp'
  | 'ssh'
  | 'database';

export type FirewallCapabilityState = {
  source: FirewallDataSource;
  status: FirewallCapabilityStatus;
  checkedAt: string;
  lastSuccessAt: string | null;
  capabilities: string[];
  errorCode?: FirewallErrorCode;
  retryable?: boolean;
  reason?: string;
  consecutiveFailures?: number;
  nextProbeAt?: string | null;
  latencyMs?: number;
  probeTrigger?: 'onboarding' | 'configuration' | 'link' | 'manual' | 'scheduled';
};

export type FirewallMonitoringState = {
  mode: FirewallMonitoringMode;
  restAvailable: boolean;
  fallbackAvailable: boolean;
  evaluatedAt: string;
  sources: FirewallCapabilityState[];
};

export type FirewallWriteCapability = {
  configured: boolean;
  enabled: boolean;
  restTrusted: boolean;
  credentialSet: boolean;
  permissionProfileVerified: boolean;
  lastVerifiedAt: string | null;
  blockedReason?: string;
};

export type FirewallConnectorState = {
  id: string;
  deviceId: string | null;
  managementHost: string;
  serialNumber: string | null;
  analyzerDeviceId: string | null;
  vdom: string;
  monitoring: FirewallMonitoringState;
  write: FirewallWriteCapability;
};

export type FirewallDataEnvelope<T> = {
  data: T | null;
  source: FirewallDataSource;
  status: FirewallDataStatus;
  collectedAt: string | null;
  unavailableReason?: string;
  errorCode?: FirewallErrorCode;
  retryable?: boolean;
};

const FALLBACK_SOURCES = new Set<FirewallDataSource>([
  'fortianalyzer',
  'event-cache',
  'snmp',
  'ssh',
]);

function isUsable(state: FirewallCapabilityState): boolean {
  return state.status === 'available';
}

export function evaluateFirewallMonitoringState(
  sources: FirewallCapabilityState[],
  evaluatedAt = new Date().toISOString()
): FirewallMonitoringState {
  const restAvailable = sources.some(
    (state) => state.source === 'fortigate-rest' && state.status === 'available'
  );
  const fallbackAvailable = sources.some(
    (state) => FALLBACK_SOURCES.has(state.source) && isUsable(state)
  );

  return {
    mode: restAvailable ? 'FULL' : fallbackAvailable ? 'LIMITED' : 'UNAVAILABLE',
    restAvailable,
    fallbackAvailable,
    evaluatedAt,
    sources,
  };
}

export function firewallMonitoringFromRestStatus(status: {
  connected: boolean;
  error?: string;
  errorCode?: FirewallErrorCode;
  retryable?: boolean;
}, checkedAt = new Date().toISOString()): FirewallMonitoringState {
  const rest: FirewallCapabilityState = {
    source: 'fortigate-rest',
    status: status.connected ? 'available' : 'unavailable',
    checkedAt,
    lastSuccessAt: status.connected ? checkedAt : null,
    capabilities: status.connected
      ? ['system-status', 'interfaces', 'policies', 'addresses', 'vips', 'ssl-vpn', 'ipsec', 'ha']
      : [],
    errorCode: status.errorCode,
    retryable: status.retryable,
    reason: status.error,
  };
  return evaluateFirewallMonitoringState([rest], checkedAt);
}

export function disabledFirewallWriteCapability(
  blockedReason = 'Firewall write operations require the V2 approval workflow'
): FirewallWriteCapability {
  return {
    configured: false,
    enabled: false,
    restTrusted: false,
    credentialSet: false,
    permissionProfileVerified: false,
    lastVerifiedAt: null,
    blockedReason,
  };
}

export function parseFirewallCapabilityStates(value: unknown): FirewallCapabilityState[] {
  if (!Array.isArray(value)) return [];
  const sources = new Set<FirewallDataSource>([
    'fortigate-rest',
    'fortianalyzer',
    'event-cache',
    'snmp',
    'ssh',
    'database',
  ]);
  const statuses = new Set<FirewallCapabilityStatus>([
    'available',
    'stale',
    'unavailable',
    'unconfigured',
  ]);
  return value.filter((item): item is FirewallCapabilityState => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const state = item as Partial<FirewallCapabilityState>;
    return Boolean(
      state.source && sources.has(state.source) &&
      state.status && statuses.has(state.status) &&
      typeof state.checkedAt === 'string' &&
      Array.isArray(state.capabilities)
    );
  });
}

export function upsertFirewallCapabilityState(
  sources: FirewallCapabilityState[],
  next: FirewallCapabilityState
): FirewallCapabilityState[] {
  return [...sources.filter((item) => item.source !== next.source), next];
}

export function availableFirewallData<T>(
  data: T,
  source: FirewallDataSource,
  collectedAt = new Date().toISOString()
): FirewallDataEnvelope<T> {
  return { data, source, status: 'available', collectedAt };
}

export function staleFirewallData<T>(
  data: T,
  source: FirewallDataSource,
  collectedAt: string,
  unavailableReason: string,
  errorCode?: FirewallErrorCode
): FirewallDataEnvelope<T> {
  return { data, source, status: 'stale', collectedAt, unavailableReason, errorCode };
}

export function unavailableFirewallData<T>(
  source: FirewallDataSource,
  unavailableReason: string,
  options: { errorCode?: FirewallErrorCode; retryable?: boolean } = {}
): FirewallDataEnvelope<T> {
  return {
    data: null,
    source,
    status: 'unavailable',
    collectedAt: null,
    unavailableReason,
    ...options,
  };
}
