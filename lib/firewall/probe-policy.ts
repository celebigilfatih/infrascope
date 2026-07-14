import {
  evaluateFirewallMonitoringState,
  parseFirewallCapabilityStates,
  upsertFirewallCapabilityState,
  type FirewallCapabilityState,
  type FirewallMonitoringState,
} from './capabilities';
import type { FirewallErrorCode } from './errors';

export type FirewallProbeTrigger =
  | 'onboarding'
  | 'configuration'
  | 'link'
  | 'manual'
  | 'scheduled';

export type FirewallProbeStatus = {
  connected: boolean;
  error?: string;
  errorCode?: FirewallErrorCode;
  retryable?: boolean;
};

export type FirewallProbeDecision = {
  monitoring: FirewallMonitoringState;
  consecutiveFailures: number;
  nextProbeAt: Date;
};

const SUCCESS_INTERVAL_MINUTES = 5;
const FAILURE_BACKOFF_MINUTES = [5, 10, 20, 40, 60] as const;

function validFailureCount(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function firewallProbeDelayMinutes(connected: boolean, consecutiveFailures: number): number {
  if (connected) return SUCCESS_INTERVAL_MINUTES;
  const index = Math.min(
    Math.max(1, consecutiveFailures) - 1,
    FAILURE_BACKOFF_MINUTES.length - 1
  );
  return FAILURE_BACKOFF_MINUTES[index];
}

export function decideFirewallRestProbe(params: {
  previousCapabilities: unknown;
  status: FirewallProbeStatus;
  checkedAt: Date;
  latencyMs: number;
  trigger: FirewallProbeTrigger;
}): FirewallProbeDecision {
  const checkedAt = params.checkedAt.toISOString();
  const previous = parseFirewallCapabilityStates(params.previousCapabilities);
  const previousRest = previous.find((item) => item.source === 'fortigate-rest');
  const consecutiveFailures = params.status.connected
    ? 0
    : validFailureCount(previousRest?.consecutiveFailures) + 1;
  const delayMinutes = firewallProbeDelayMinutes(params.status.connected, consecutiveFailures);
  const nextProbeAt = new Date(params.checkedAt.getTime() + delayMinutes * 60_000);
  const restState: FirewallCapabilityState = {
    source: 'fortigate-rest',
    status: params.status.connected ? 'available' : 'unavailable',
    checkedAt,
    lastSuccessAt: params.status.connected
      ? checkedAt
      : previousRest?.lastSuccessAt || null,
    capabilities: params.status.connected
      ? ['system-status', 'interfaces', 'policies', 'addresses', 'vips', 'ssl-vpn', 'ipsec', 'ha']
      : [],
    errorCode: params.status.errorCode,
    retryable: params.status.retryable,
    reason: params.status.error,
    consecutiveFailures,
    nextProbeAt: nextProbeAt.toISOString(),
    latencyMs: Math.max(0, Math.round(params.latencyMs)),
    probeTrigger: params.trigger,
  };
  const sources = upsertFirewallCapabilityState(previous, restState);
  return {
    monitoring: evaluateFirewallMonitoringState(sources, checkedAt),
    consecutiveFailures,
    nextProbeAt,
  };
}
