import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decideFirewallRestProbe,
  firewallProbeDelayMinutes,
} from '../lib/firewall/probe-policy';
import type { FirewallCapabilityState } from '../lib/firewall/capabilities';

const checkedAt = new Date('2026-07-13T12:00:00.000Z');
const previous: FirewallCapabilityState[] = [
  {
    source: 'fortigate-rest',
    status: 'unavailable',
    checkedAt: '2026-07-13T11:55:00.000Z',
    lastSuccessAt: '2026-07-13T10:00:00.000Z',
    capabilities: [],
    consecutiveFailures: 1,
    errorCode: 'TLS_CERTIFICATE_EXPIRED',
  },
  {
    source: 'snmp',
    status: 'available',
    checkedAt: '2026-07-13T11:59:00.000Z',
    lastSuccessAt: '2026-07-13T11:59:00.000Z',
    capabilities: ['system-health'],
  },
];

assert.deepEqual(
  [1, 2, 3, 4, 5, 6].map((count) => firewallProbeDelayMinutes(false, count)),
  [5, 10, 20, 40, 60, 60]
);
assert.equal(firewallProbeDelayMinutes(true, 9), 5);

const failed = decideFirewallRestProbe({
  previousCapabilities: previous,
  status: {
    connected: false,
    error: 'FortiGate TLS certificate has expired',
    errorCode: 'TLS_CERTIFICATE_EXPIRED',
    retryable: false,
  },
  checkedAt,
  latencyMs: 123.4,
  trigger: 'scheduled',
});
assert.equal(failed.monitoring.mode, 'LIMITED');
assert.equal(failed.consecutiveFailures, 2);
assert.equal(failed.nextProbeAt.toISOString(), '2026-07-13T12:10:00.000Z');
assert.equal(failed.monitoring.sources.find((item) => item.source === 'snmp')?.status, 'available');
assert.equal(
  failed.monitoring.sources.find((item) => item.source === 'fortigate-rest')?.lastSuccessAt,
  '2026-07-13T10:00:00.000Z'
);

const recovered = decideFirewallRestProbe({
  previousCapabilities: failed.monitoring.sources,
  status: { connected: true },
  checkedAt: new Date('2026-07-13T12:10:00.000Z'),
  latencyMs: 80,
  trigger: 'scheduled',
});
assert.equal(recovered.monitoring.mode, 'FULL');
assert.equal(recovered.consecutiveFailures, 0);
assert.equal(recovered.nextProbeAt.toISOString(), '2026-07-13T12:15:00.000Z');

const schedulerSource = readFileSync('lib/firewall/recovery-scheduler.ts', 'utf8');
assert.match(schedulerSource, /pg_try_advisory_xact_lock/);
assert.match(schedulerSource, /nextProbeAt: new Date\(now\.getTime\(\) \+ CLAIM_LEASE_MS\)/);
assert.match(schedulerSource, /trigger: 'scheduled'/);

const instrumentationSource = readFileSync('instrumentation-node.ts', 'utf8');
assert.match(instrumentationSource, /startFirewallRecoveryScheduler\(\)/);

const manualRoute = readFileSync('app/api/firewalls/[id]/probe/route.ts', 'utf8');
assert.match(manualRoute, /actor\.role !== 'ADMIN'/);
assert.match(manualRoute, /PROBE_RATE_LIMITED/);
assert.match(manualRoute, /Retry-After/);

const recoveryRoute = readFileSync('app/api/firewalls/recovery/route.ts', 'utf8');
assert.match(recoveryRoute, /firewall_recovery_last_tick/);
assert.match(recoveryRoute, /cycleInProgress/);

console.log('Firewall recovery and probe backoff checks passed.');
