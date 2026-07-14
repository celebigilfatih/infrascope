import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const caRoute = read('app/api/firewalls/[id]/tls-ca/route.ts');
const tlsHelper = read('lib/security/tls.ts');
const credentialHelper = read('lib/security/integration-credentials.ts');
const fortiGate = read('lib/integrations/fortigate.ts');
const caValidation = read('lib/firewall/tls-ca.ts');
const detailRoute = read('app/api/firewalls/[id]/route.ts');
const ui = read('components/firewall/FirewallTrustedCaCard.tsx');

assert.match(caRoute, /getRequestActor/);
assert.match(caRoute, /auth\.role !== 'ADMIN'/);
assert.match(caRoute, /normalizeTrustedCaBundle/);
assert.match(caRoute, /uploaded instanceof File/);
assert.match(caRoute, /firewall\.tls-ca\.configure/);
assert.match(caRoute, /firewall\.tls-ca\.remove/);
assert.match(caRoute, /clearFortiGateConnectors/);
assert.match(caValidation, /PRIVATE_KEY_PATTERN/);
assert.match(caValidation, /certificate\.ca/);

assert.match(credentialHelper, /FORTIGATE: \['password', 'accessToken', 'tlsCaPem'\]/);
assert.match(tlsHelper, /rootCertificates/);
assert.match(tlsHelper, /caPem\?: string/);
assert.match(tlsHelper, /getAgent\(integration, \{ caPem \}\)/);
assert.match(fortiGate, /getHttpsRequestTlsOptions\('FORTIGATE', \{ caPem: this\.config\.tlsCaPem \}\)/);
assert.match(fortiGate, /caPem: this\.config\.tlsCaPem/);
assert.match(detailRoute, /integrationConfig: safeIntegrationConfig/);
assert.match(detailRoute, /let tls = \{ configured: false/);
assert.match(ui, /CA yükle ve kontrol et/);
assert.match(ui, /global TLS bypass kullanılmaz/);

console.log('Firewall trusted CA checks passed.');
