import {
  integrationConfigNeedsDedicatedKey,
  integrationConfigNeedsProtection,
  isProtectedCredential,
  protectNmsBackup,
  protectNmsCredential,
  protectCredential,
  protectIntegrationConfig,
  unprotectCredential,
  unprotectIntegrationConfig,
  unprotectNmsBackup,
  unprotectNmsCredential,
} from '../lib/security/integration-credentials';
import {
  NmsSnmpValidationError,
  normalizeSnmpV3AuthProtocol,
  normalizeSnmpV3PrivacyProtocol,
  normalizeSnmpV3SecurityLevel,
  normalizeSnmpV3Username,
  normalizeSnmpVersion,
  validateSnmpV3Secret,
} from '../lib/nms/snmp-config';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dedicatedKey = Buffer.alloc(32, 7).toString('base64');
const otherKey = Buffer.alloc(32, 8).toString('base64');
const dedicatedEnv = {
  INTEGRATION_CREDENTIALS_KEY: dedicatedKey,
  NEXTAUTH_SECRET: 'session-secret',
};
const context = 'infrascope:FORTIGATE:password:v1';

const protectedValue = protectCredential('super-secret', context, dedicatedEnv);
expect(isProtectedCredential(protectedValue), 'credential should use a protected envelope');
expect(!protectedValue.includes('super-secret'), 'ciphertext must not contain plaintext');
expect(
  unprotectCredential(protectedValue, context, dedicatedEnv) === 'super-secret',
  'credential roundtrip failed'
);

let wrongKeyRejected = false;
try {
  unprotectCredential(protectedValue, context, {
    INTEGRATION_CREDENTIALS_KEY: otherKey,
    NEXTAUTH_SECRET: 'session-secret',
  });
} catch {
  wrongKeyRejected = true;
}
expect(wrongKeyRejected, 'wrong key must be rejected');

let tamperRejected = false;
try {
  const envelopeParts = protectedValue.split(':');
  const tamperedCiphertext = Buffer.from(envelopeParts[5], 'base64url');
  tamperedCiphertext[0] ^= 1;
  envelopeParts[5] = tamperedCiphertext.toString('base64url');
  unprotectCredential(envelopeParts.join(':'), context, dedicatedEnv);
} catch {
  tamperRejected = true;
}
expect(tamperRejected, 'tampered ciphertext must be rejected');

const legacyConfig = {
  host: 'firewall.example.test',
  username: 'reader',
  password: 'legacy-password',
  accessToken: 'legacy-token',
};
expect(
  integrationConfigNeedsProtection(legacyConfig, 'FORTIGATE'),
  'legacy plaintext config should require protection'
);
const encryptedConfig = protectIntegrationConfig<typeof legacyConfig>(
  legacyConfig,
  'FORTIGATE',
  dedicatedEnv
);
expect(!integrationConfigNeedsProtection(encryptedConfig, 'FORTIGATE'), 'protected config should be idempotent');
expect(encryptedConfig.host === legacyConfig.host, 'non-secret fields must remain readable');
expect(encryptedConfig.password !== legacyConfig.password, 'password must be encrypted');
expect(encryptedConfig.accessToken !== legacyConfig.accessToken, 'token must be encrypted');
const decryptedConfig = unprotectIntegrationConfig<typeof legacyConfig>(
  encryptedConfig,
  'FORTIGATE',
  dedicatedEnv
);
expect(decryptedConfig.password === legacyConfig.password, 'password config roundtrip failed');
expect(decryptedConfig.accessToken === legacyConfig.accessToken, 'token config roundtrip failed');

const sessionEnv = { NEXTAUTH_SECRET: 'stable-session-secret' };
const sessionProtected = protectCredential('fallback-secret', context, sessionEnv);
const sessionWithDedicatedKey = {
  NEXTAUTH_SECRET: 'stable-session-secret',
  INTEGRATION_CREDENTIALS_KEY: dedicatedKey,
};
expect(
  unprotectCredential(sessionProtected, context, sessionWithDedicatedKey) === 'fallback-secret',
  'session-derived ciphertext must survive adding a dedicated key'
);
const sessionProtectedConfig = {
  host: 'firewall.example.test',
  password: sessionProtected,
};
expect(
  integrationConfigNeedsDedicatedKey(sessionProtectedConfig, 'FORTIGATE', sessionWithDedicatedKey),
  'session-derived config must be scheduled for dedicated-key migration'
);

const rotatedEnv = {
  INTEGRATION_CREDENTIALS_KEY: otherKey,
  INTEGRATION_CREDENTIALS_PREVIOUS_KEY: dedicatedKey,
  NEXTAUTH_SECRET: 'session-secret',
};
expect(
  unprotectCredential(protectedValue, context, rotatedEnv) === 'super-secret',
  'previous key must decrypt credentials during a rotation window'
);
const reprotectedValue = protectCredential(protectedValue, context, rotatedEnv);
expect(
  unprotectCredential(reprotectedValue, context, {
    INTEGRATION_CREDENTIALS_KEY: otherKey,
    NEXTAUTH_SECRET: 'session-secret',
  }) === 'super-secret',
  'rotated credential must decrypt without the previous key'
);

const nmsPassword = protectNmsCredential('nms-password', 'sshPassword', dedicatedEnv);
expect(!nmsPassword.includes('nms-password'), 'NMS SSH password must be encrypted');
expect(
  unprotectNmsCredential(nmsPassword, 'sshPassword', dedicatedEnv) === 'nms-password',
  'NMS SSH credential roundtrip failed'
);
let crossContextRejected = false;
try {
  unprotectNmsCredential(nmsPassword, 'snmpCommunity', dedicatedEnv);
} catch {
  crossContextRejected = true;
}
expect(crossContextRejected, 'NMS credentials must not decrypt across fields');

for (const [field, plaintext] of [
  ['snmpV3AuthPassword', 'auth-passphrase'],
  ['snmpV3PrivacyPassword', 'privacy-passphrase'],
] as const) {
  const protectedSecret = protectNmsCredential(plaintext, field, dedicatedEnv);
  expect(!protectedSecret.includes(plaintext), `${field} must be encrypted`);
  expect(
    unprotectNmsCredential(protectedSecret, field, dedicatedEnv) === plaintext,
    `${field} roundtrip failed`
  );
  let fieldIsolationRejected = false;
  try {
    unprotectNmsCredential(
      protectedSecret,
      field === 'snmpV3AuthPassword' ? 'snmpV3PrivacyPassword' : 'snmpV3AuthPassword',
      dedicatedEnv
    );
  } catch {
    fieldIsolationRejected = true;
  }
  expect(fieldIsolationRejected, `${field} must not decrypt under another SNMPv3 field`);
}

expect(normalizeSnmpVersion('v3') === '3', 'SNMPv3 version normalization failed');
expect(normalizeSnmpV3Username('monitor') === 'monitor', 'SNMPv3 username normalization failed');
expect(normalizeSnmpV3SecurityLevel('authNoPriv') === 'authNoPriv', 'SNMPv3 security level failed');
expect(normalizeSnmpV3AuthProtocol('sha256') === 'SHA-256', 'SNMPv3 SHA-256 normalization failed');
expect(normalizeSnmpV3PrivacyProtocol('aes128') === 'AES', 'SNMPv3 AES normalization failed');
expect(validateSnmpV3Secret('12345678', 'test secret') === '12345678', 'SNMPv3 secret validation failed');
for (const invalid of [
  () => normalizeSnmpVersion('v4'),
  () => normalizeSnmpV3Username('contains space'),
  () => normalizeSnmpV3SecurityLevel('noAuthNoPriv'),
  () => normalizeSnmpV3AuthProtocol('MD5'),
  () => normalizeSnmpV3PrivacyProtocol('DES'),
  () => validateSnmpV3Secret('short', 'test secret'),
]) {
  let rejected = false;
  try {
    invalid();
  } catch (error) {
    rejected = error instanceof NmsSnmpValidationError;
  }
  expect(rejected, 'unsafe SNMPv3 input must be rejected by the server contract');
}

const protectedBackup = protectNmsBackup('config system global\nend', dedicatedEnv);
expect(!protectedBackup.includes('config system global'), 'NMS backup must be encrypted');
expect(
  unprotectNmsBackup(protectedBackup, dedicatedEnv) === 'config system global\nend',
  'NMS backup roundtrip failed'
);

console.log('Integration credential encryption check passed (integrations, NMS v1/v2c/v3, backups, tamper, rotation).');
