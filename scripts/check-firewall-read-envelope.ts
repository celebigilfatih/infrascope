import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'lib/firewall/read-service.ts'), 'utf8');
const resourceRoute = fs.readFileSync(
  path.join(root, 'app/api/firewalls/[id]/[resource]/route.ts'),
  'utf8'
);
const vpnRoute = fs.readFileSync(
  path.join(root, 'app/api/firewalls/[id]/vpn/[kind]/route.ts'),
  'utf8'
);

assert.match(service, /availableFirewallData\(data, 'fortigate-rest'\)/);
assert.match(service, /staleFirewallData\(/);
assert.match(service, /unavailableFirewallData\('fortigate-rest'/);
assert.match(service, /staleFirewallData\([\s\S]*?'database'/);
assert.doesNotMatch(service, /data:\s*\[\]/);

for (const resource of ['status', 'interfaces', 'policies', 'addresses', 'vips', 'ha']) {
  assert.match(resourceRoute, new RegExp(`resource === '${resource}'`));
}
assert.match(vpnRoute, /kind === 'ssl-sessions'/);
assert.match(vpnRoute, /kind === 'ipsec'/);
assert.match(resourceRoute, /firewallListQueryFromUrl/);
assert.match(resourceRoute, /paginateFirewallItems/);
assert.match(vpnRoute, /paginateFirewallItems/);
assert.match(resourceRoute, /password:\s*_password/);
assert.doesNotMatch(resourceRoute, /password:\s*result\.password/);
assert.match(resourceRoute, /enabled:\s*null/);

console.log('Firewall source/freshness envelope checks passed.');
