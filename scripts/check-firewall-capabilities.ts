import assert from 'node:assert/strict';
import {
  availableFirewallData,
  disabledFirewallWriteCapability,
  evaluateFirewallMonitoringState,
  parseFirewallCapabilityStates,
  staleFirewallData,
  unavailableFirewallData,
  upsertFirewallCapabilityState,
  type FirewallCapabilityState,
} from '../lib/firewall/capabilities';

const checkedAt = '2026-07-13T12:00:00.000Z';
const source = (
  name: FirewallCapabilityState['source'],
  status: FirewallCapabilityState['status']
): FirewallCapabilityState => ({
  source: name,
  status,
  checkedAt,
  lastSuccessAt: status === 'unconfigured' || status === 'unavailable' ? null : checkedAt,
  capabilities: [],
});

assert.equal(
  evaluateFirewallMonitoringState([
    source('fortigate-rest', 'available'),
    source('snmp', 'unavailable'),
  ], checkedAt).mode,
  'FULL'
);

assert.equal(
  evaluateFirewallMonitoringState([
    source('fortigate-rest', 'unavailable'),
    source('snmp', 'stale'),
  ], checkedAt).mode,
  'UNAVAILABLE',
  'stale fallback data must remain visible without claiming live monitoring'
);

const limited = evaluateFirewallMonitoringState([
  { ...source('fortigate-rest', 'unavailable'), errorCode: 'TLS_CERTIFICATE_EXPIRED' },
  source('snmp', 'available'),
  source('fortianalyzer', 'available'),
], checkedAt);
assert.equal(limited.mode, 'LIMITED');
assert.equal(limited.restAvailable, false);
assert.equal(limited.fallbackAvailable, true);

assert.equal(
  evaluateFirewallMonitoringState([
    source('fortigate-rest', 'unavailable'),
    source('snmp', 'unavailable'),
    source('ssh', 'unconfigured'),
    source('database', 'stale'),
  ], checkedAt).mode,
  'UNAVAILABLE',
  'database snapshots alone must not mark monitoring as available'
);

assert.deepEqual(availableFirewallData([1], 'snmp', checkedAt), {
  data: [1], source: 'snmp', status: 'available', collectedAt: checkedAt,
});
assert.equal(staleFirewallData([1], 'database', checkedAt, 'REST unavailable').status, 'stale');
assert.equal(
  unavailableFirewallData('fortigate-rest', 'Certificate expired', {
    errorCode: 'TLS_CERTIFICATE_EXPIRED', retryable: false,
  }).data,
  null
);
const write = disabledFirewallWriteCapability();
assert.equal(write.enabled, false);
assert.equal(write.restTrusted, false);

const parsed = parseFirewallCapabilityStates([
  source('fortianalyzer', 'available'),
  { source: 'invalid', status: 'available', checkedAt, capabilities: [] },
  null,
]);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].source, 'fortianalyzer');

const replaced = upsertFirewallCapabilityState(
  [source('fortigate-rest', 'unavailable'), source('fortianalyzer', 'stale')],
  source('fortianalyzer', 'available')
);
assert.equal(replaced.length, 2);
assert.equal(replaced.find((item) => item.source === 'fortianalyzer')?.status, 'available');

console.log('Firewall capability and data envelope checks passed.');
