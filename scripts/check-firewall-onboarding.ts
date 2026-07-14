import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FirewallOnboardingValidationError,
  normalizeFirewallOnboardingInput,
} from '../lib/firewall/onboarding';

const valid = normalizeFirewallOnboardingInput({
  name: 'Branch Firewall',
  host: 'FG-01.EXAMPLE.LOCAL',
  username: 'readonly',
  password: 'secret',
});
assert.equal(valid.host, 'fg-01.example.local');
assert.equal(valid.vdom, 'root');

const hybrid = normalizeFirewallOnboardingInput({
  name: 'Branch FortiGate',
  host: '10.0.0.2',
  accessToken: 'token',
  snmp: {
    version: '3',
    username: 'infrascope',
    securityLevel: 'authPriv',
    authProtocol: 'SHA-256',
    authPassword: 'auth-secret',
    privacyProtocol: 'AES',
    privacyPassword: 'privacy-secret',
    pollingInterval: 300,
  },
  ssh: { username: 'readonly', password: 'ssh-secret' },
});
assert.equal(hybrid.snmp?.version, '3');
assert.equal(hybrid.ssh?.port, 22);

for (const host of ['https://10.0.0.1', '10.0.0.1/api', '999.10.10.10', 'bad..host']) {
  assert.throws(
    () => normalizeFirewallOnboardingInput({ name: 'Invalid', host, accessToken: 'token' }),
    FirewallOnboardingValidationError
  );
}
assert.throws(
  () => normalizeFirewallOnboardingInput({ name: 'No credentials', host: '10.0.0.1' }),
  FirewallOnboardingValidationError
);
assert.throws(
  () => normalizeFirewallOnboardingInput({ name: 'Bad VDOM', host: '10.0.0.1', accessToken: 'token', vdom: '\u0000' }),
  FirewallOnboardingValidationError
);

const root = path.resolve(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'app/api/firewalls/route.ts'), 'utf8');
const onboardingDialog = fs.readFileSync(
  path.join(root, 'components/firewall/FirewallOnboardingDialog.tsx'),
  'utf8'
);
const probeService = fs.readFileSync(path.join(root, 'lib/firewall/probe.ts'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
assert.match(route, /protectIntegrationConfig/);
assert.match(route, /prisma\.\$transaction/);
assert.match(route, /reserveNextNmsDeviceId/);
assert.match(route, /protectNmsCredential/);
assert.doesNotMatch(route, /snmp:\s*input\.snmp\s*,/);
assert.ok(
  route.indexOf('prisma.$transaction') < route.indexOf('probeFirewallConnector('),
  'inventory transaction must complete before the REST probe starts'
);
assert.match(probeService, /getFortiGateConnector\(\{/);
assert.doesNotMatch(route, /select:\s*\{[^}]*sshPassword/s);
assert.match(middleware, /'\/api\/firewalls':\s*'firewall'/);
assert.match(
  onboardingDialog,
  /const \[snmpEnabled, setSnmpEnabled\] = useState\(false\)/,
  'optional SNMP fallback must not block REST-only onboarding by default'
);

console.log('Firewall onboarding validation and fail-open probe checks passed.');
