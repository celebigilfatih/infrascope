import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decideFortiAnalyzerIdentity,
  normalizeFortiAnalyzerDeviceId,
} from '../lib/firewall/fortianalyzer-identity';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

assert.equal(normalizeFortiAnalyzerDeviceId(' fg100f-ab12 '), 'FG100F-AB12');
assert.equal(normalizeFortiAnalyzerDeviceId(''), null);

const exact = decideFortiAnalyzerIdentity({
  serialNumber: 'FG100F-AB12',
  vdom: ' Root ',
  devices: [
    { devid: 'FG100F-OTHER', name: 'Same Name', ip: '10.0.0.1' },
    { devid: 'fg100f-ab12', name: 'Different Name', ip: '10.0.0.99' },
  ],
});
assert.deepEqual(exact, {
  status: 'VERIFIED',
  analyzerDeviceId: 'FG100F-AB12',
  vdom: 'root',
});

const nameAndIpMustNotMatch = decideFortiAnalyzerIdentity({
  serialNumber: 'FG100F-AB12',
  vdom: 'root',
  devices: [{ devid: 'FG100F-WRONG', name: 'FG100F-AB12', ip: 'FG100F-AB12' }],
});
assert.equal(nameAndIpMustNotMatch.status, 'NOT_FOUND');

const schema = read('prisma/schema.prisma');
assert.match(schema, /@@unique\(\[analyzerDeviceId, vdom\]\)/);
assert.match(schema, /devid\s+String\?/);
assert.match(schema, /@@index\(\[devid, vdom, eventTime\]\)/);

const migration = read('prisma/migrations/20260713220000_add_cached_event_device_identity/migration.sql');
assert.match(migration, /"rawLog"->>'devid'/);
assert.match(migration, /"rawLog"->>'vd'/);

const correlation = read('lib/firewall/fortianalyzer-correlation.ts');
assert.match(correlation, /identityStatus !== 'VERIFIED'/);
assert.match(correlation, /matchBasis: 'exact-verified-serial'/);
assert.doesNotMatch(correlation, /decision\.name|decision\.ip/);

const events = read('lib/firewall/fortianalyzer-events.ts');
assert.match(events, /devid: connector\.analyzerDeviceId/);
assert.match(events, /vdom: connector\.vdom\.toLowerCase\(\)/);
assert.match(events, /\{ deviceId: params\.analyzerDeviceId \}/);
const eventItemType = events.match(/type FirewallEventItem = \{([\s\S]*?)\n\};/)?.[1] || '';
assert.doesNotMatch(eventItemType, /rawLog|password|token|credential/i);

const analyzerRoute = read('app/api/firewalls/[id]/analyzer-correlation/route.ts');
assert.match(analyzerRoute, /auth\.role !== 'ADMIN'/);

const analyzerService = read('lib/integrations/fortianalyzer.ts');
assert.match(analyzerService, /options\.deviceId \|\| process\.env\.FA_DEVICE_FILTER/);

console.log('FortiAnalyzer exact identity and event scope checks passed.');
