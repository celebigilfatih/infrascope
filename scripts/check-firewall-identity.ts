import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildFortiGateIdentityKey,
  decideFortiGateIdentity,
} from '../lib/firewall/identity-state';

assert.equal(buildFortiGateIdentityKey(' fg100e-abc ', 'ROOT'), 'FG100E-ABC::root');
assert.notEqual(
  buildFortiGateIdentityKey('FG100E-ABC', 'root'),
  buildFortiGateIdentityKey('FG100E-ABC', 'tenant-a')
);

assert.deepEqual(decideFortiGateIdentity({
  connectorId: 'one', currentIdentityKey: null, candidateKey: 'SERIAL::root', candidateOwnerId: null,
}), {
  status: 'VERIFIED', identityKey: 'SERIAL::root', identityCandidateKey: null, identityConflictWithId: null,
});
assert.equal(decideFortiGateIdentity({
  connectorId: 'two', currentIdentityKey: null, candidateKey: 'SERIAL::root', candidateOwnerId: 'one',
}).status, 'CONFLICT');
const drift = decideFortiGateIdentity({
  connectorId: 'one', currentIdentityKey: 'OLD::root', candidateKey: 'NEW::root', candidateOwnerId: null,
});
assert.equal(drift.status, 'CONFLICT');
assert.equal(drift.identityKey, 'OLD::root', 'verified identity must survive a conflicting probe');
assert.equal(drift.identityCandidateKey, 'NEW::root');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'prisma/migrations/20260713210000_add_firewall_connector_identity/migration.sql'),
  'utf8'
);
const updateRoute = fs.readFileSync(path.join(root, 'app/api/firewalls/[id]/route.ts'), 'utf8');
const listRoute = fs.readFileSync(path.join(root, 'app/api/firewalls/route.ts'), 'utf8');
const linkRoute = fs.readFileSync(path.join(root, 'app/api/firewalls/link/route.ts'), 'utf8');
const probeService = fs.readFileSync(path.join(root, 'lib/firewall/probe.ts'), 'utf8');
assert.match(schema, /model FirewallConnector/);
assert.match(schema, /identityKey\s+String\?\s+@unique/);
assert.match(schema, /@@unique\(\[integrationConfigId, vdom\]\)/);
assert.match(migration, /Backfill only explicit Device links/);
assert.doesNotMatch(migration, /fortiDeviceId"\s*=\s*ic\."config"->>'host'/);
assert.match(updateRoute, /prisma\.firewallConnector\.update/);
assert.doesNotMatch(updateRoute, /prisma\.device\.create/);
assert.match(listRoute, /requiresInventoryLink:\s*true/);
assert.match(linkRoute, /type !== 'FIREWALL'/);
assert.match(linkRoute, /firewall\.connector\.link/);
assert.doesNotMatch(linkRoute, /findFirst\(/);
assert.match(probeService, /serialNumber:\s*connector\.serialNumber/);
assert.doesNotMatch(probeService, /serialNumber:\s*status\.serial/);

console.log('Firewall permanent identity checks passed.');
