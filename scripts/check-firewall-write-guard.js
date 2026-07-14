#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const permissionPolicy = read('lib/auth/permission-policy.ts');
const middleware = read('middleware.ts');
const quarantineRoute = read('app/api/security/quarantine/route.ts');
const writePolicy = read('lib/firewall/write-policy.ts');
const featureFlags = read('lib/firewall/feature-flags.ts');
const deployEnv = read('deploy/env.example');

const checks = [
  {
    name: 'firewall resource is declared',
    pass: /\|\s*'firewall'/.test(permissionPolicy),
  },
  {
    name: 'firewall reads are explicitly permitted',
    pass: /resource:\s*'firewall',\s*action:\s*'read'/.test(permissionPolicy),
  },
  {
    name: 'firewall writes are ADMIN-only',
    pass: /resource:\s*'firewall',\s*action:\s*'write',\s*roles:\s*\['ADMIN'\]/.test(permissionPolicy),
  },
  {
    name: 'firewall deletes are ADMIN-only',
    pass: /resource:\s*'firewall',\s*action:\s*'delete',\s*roles:\s*\['ADMIN'\]/.test(permissionPolicy),
  },
  {
    name: 'FortiGate integration route is mapped',
    pass: /'\/api\/integrations\/fortigate':\s*'firewall'/.test(middleware),
  },
  {
    name: 'quarantine route is mapped',
    pass: /'\/api\/security\/quarantine':\s*'firewall'/.test(middleware),
  },
  {
    name: 'firewall policies route is mapped',
    pass: /'\/api\/firewall-policies':\s*'firewall'/.test(middleware),
  },
  {
    name: 'firewall onboarding route is mapped',
    pass: /'\/api\/firewalls':\s*'firewall'/.test(middleware),
  },
  {
    name: 'legacy writes are fail-closed',
    pass: /===\s*'true'/.test(featureFlags) && /feature-disabled/.test(writePolicy),
  },
  {
    name: 'POST and DELETE both use the server-side write guard',
    pass: (quarantineRoute.match(/requireLegacyWriteAccess\(request\)/g) || []).length === 2,
  },
  {
    name: 'POST and DELETE both use fail-closed audit execution',
    pass: (quarantineRoute.match(/executeFirewallWriteWithAudit\(/g) || []).length === 2 &&
      !/logAudit\(/.test(quarantineRoute),
  },
  {
    name: 'customer deploy defaults legacy writes to false',
    pass: /^FORTIGATE_LEGACY_WRITES_ENABLED=false$/m.test(deployEnv),
  },
];

const failures = checks.filter((check) => !check.pass);
if (failures.length > 0) {
  console.error('Firewall write guard check failed:');
  for (const failure of failures) console.error(`- ${failure.name}`);
  process.exit(1);
}

console.log(`Firewall write guard check passed (${checks.length} checks).`);
