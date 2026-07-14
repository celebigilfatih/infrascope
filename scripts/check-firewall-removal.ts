import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const connectorRoute = fs.readFileSync(path.join(root, 'app/api/firewalls/[id]/route.ts'), 'utf8');
const listRoute = fs.readFileSync(path.join(root, 'app/api/firewalls/route.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/integrations/firewall/page.tsx'), 'utf8');

assert.match(connectorRoute, /export async function DELETE/);
assert.match(connectorRoute, /getRequestActor/);
assert.match(connectorRoute, /auth\.role !== 'ADMIN'/);
assert.match(connectorRoute, /action: 'firewall\.connector\.remove'/);
assert.match(connectorRoute, /inventoryPreserved: true/);
assert.match(connectorRoute, /clearFortiGateConnectors/);
assert.match(connectorRoute, /integrationConfig\.delete/);
assert.doesNotMatch(connectorRoute, /device\.delete\(\{ where: \{ id: connector\.deviceId \}/);

assert.match(listRoute, /configId is required/);
assert.match(listRoute, /action: 'firewall\.legacy-integration\.remove'/);
assert.match(listRoute, /firewallConnectors\.length > 0/);
assert.match(page, /FirewallRemovalButton/);
assert.match(page, /Firewall üzerinde hiçbir değişiklik yapılmaz/);

console.log('Firewall removal guard checks passed.');
