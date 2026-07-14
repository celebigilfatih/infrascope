import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ENVELOPE_PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

type KeySource = 'i' | 's';
type SecretBytes = Uint8Array<ArrayBuffer>;
type CredentialEnvironment = {
  INTEGRATION_CREDENTIALS_KEY?: string;
  INTEGRATION_CREDENTIALS_PREVIOUS_KEY?: string;
  NEXTAUTH_SECRET?: string;
};

function currentCredentialEnvironment(): CredentialEnvironment {
  return {
    INTEGRATION_CREDENTIALS_KEY: process.env.INTEGRATION_CREDENTIALS_KEY,
    INTEGRATION_CREDENTIALS_PREVIOUS_KEY: process.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  };
}

export type IntegrationCredentialProfile = 'FORTIGATE' | 'FORTIANALYZER';
export type NmsCredentialField =
  | 'snmpCommunity'
  | 'snmpV3AuthPassword'
  | 'snmpV3PrivacyPassword'
  | 'sshPassword';

const PROFILE_FIELDS: Record<IntegrationCredentialProfile, readonly string[]> = {
  FORTIGATE: ['password', 'accessToken', 'tlsCaPem'],
  FORTIANALYZER: ['password', 'apiKey'],
};

function copyBytes(value: ArrayLike<number>): SecretBytes {
  const copy = new Uint8Array(new ArrayBuffer(value.length));
  copy.set(value);
  return copy;
}

function concatBytes(...chunks: ArrayLike<number>[]): SecretBytes {
  const result = new Uint8Array(new ArrayBuffer(
    chunks.reduce((total, chunk) => total + chunk.length, 0)
  ));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(Array.from(value)).toString('base64url');
}

function decodeDedicatedKey(value: string): SecretBytes {
  const trimmed = value.trim();
  const decoded = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  const bytes = copyBytes(decoded);

  if (bytes.length !== KEY_BYTES) {
    throw new Error('INTEGRATION_CREDENTIALS_KEY must contain exactly 32 bytes (base64 or 64-character hex)');
  }

  return bytes;
}

function deriveSessionKey(secret: string): SecretBytes {
  return copyBytes(new Uint8Array(hkdfSync(
    'sha256',
    secret,
    'infrascope',
    'integration-credentials:v1',
    KEY_BYTES
  )));
}

function getEncryptionKey(env: CredentialEnvironment): { source: KeySource; key: SecretBytes } {
  if (env.INTEGRATION_CREDENTIALS_KEY?.trim()) {
    return { source: 'i', key: decodeDedicatedKey(env.INTEGRATION_CREDENTIALS_KEY) };
  }

  if (!env.NEXTAUTH_SECRET?.trim()) {
    throw new Error('INTEGRATION_CREDENTIALS_KEY or NEXTAUTH_SECRET is required to protect integration credentials');
  }

  return { source: 's', key: deriveSessionKey(env.NEXTAUTH_SECRET) };
}

function getDecryptionKeys(source: KeySource, env: CredentialEnvironment): SecretBytes[] {
  if (source === 'i') {
    const keys = [
      env.INTEGRATION_CREDENTIALS_KEY,
      env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(decodeDedicatedKey);
    if (keys.length === 0) {
      throw new Error('INTEGRATION_CREDENTIALS_KEY is required to decrypt this integration credential');
    }
    return keys;
  }

  if (!env.NEXTAUTH_SECRET?.trim()) {
    throw new Error('NEXTAUTH_SECRET is required to decrypt this legacy integration credential');
  }
  return [deriveSessionKey(env.NEXTAUTH_SECRET)];
}

function contextFor(profile: IntegrationCredentialProfile, field: string): string {
  return `infrascope:${profile}:${field}:v1`;
}

function nmsContextFor(field: NmsCredentialField): string {
  return `infrascope:NMS_DEVICE:${field}:v1`;
}

const NMS_BACKUP_CONTEXT = 'infrascope:NMS_BACKUP:configuration:v1';

export function isProtectedCredential(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${ENVELOPE_PREFIX}:`);
}

export function protectCredential(
  value: string,
  context: string,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  if (!value) return value;

  const plaintext = isProtectedCredential(value)
    ? unprotectCredential(value, context, env)
    : value;
  const { source, key } = getEncryptionKey(env);
  const iv = copyBytes(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(new TextEncoder().encode(context));
  const ciphertext = concatBytes(
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  );
  const authTag = copyBytes(cipher.getAuthTag());

  return [
    ENVELOPE_PREFIX,
    source,
    encodeBase64Url(iv),
    encodeBase64Url(authTag),
    encodeBase64Url(ciphertext),
  ].join(':');
}

export function unprotectCredential(
  value: string,
  context: string,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  if (!isProtectedCredential(value)) return value;

  const parts = value.split(':');
  if (parts.length !== 6 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Integration credential envelope is malformed');
  }

  const source = parts[2];
  if (source !== 'i' && source !== 's') {
    throw new Error('Integration credential key source is unsupported');
  }

  try {
    const keys = getDecryptionKeys(source, env);
    for (const key of keys) {
      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          key,
          copyBytes(Buffer.from(parts[3], 'base64url'))
        );
        decipher.setAAD(new TextEncoder().encode(context));
        decipher.setAuthTag(copyBytes(Buffer.from(parts[4], 'base64url')));
        const plaintext = concatBytes(
          decipher.update(copyBytes(Buffer.from(parts[5], 'base64url'))),
          decipher.final()
        );
        return new TextDecoder().decode(plaintext);
      } catch {
        // Try the previous key during a controlled rotation window.
      }
    }
    throw new Error('Integration credential could not be decrypted');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INTEGRATION_CREDENTIALS_KEY')) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith('NEXTAUTH_SECRET')) {
      throw error;
    }
    throw new Error('Integration credential could not be decrypted');
  }
}

function cloneConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Integration configuration must be a JSON object');
  }
  return structuredClone(config as Record<string, unknown>);
}

export function protectIntegrationConfig<T>(
  config: unknown,
  profile: IntegrationCredentialProfile,
  env: CredentialEnvironment = currentCredentialEnvironment()
): T {
  const protectedConfig = cloneConfig(config);
  for (const field of PROFILE_FIELDS[profile]) {
    const value = protectedConfig[field];
    if (typeof value === 'string' && value.length > 0) {
      protectedConfig[field] = protectCredential(value, contextFor(profile, field), env);
    }
  }
  return protectedConfig as T;
}

export function unprotectIntegrationConfig<T>(
  config: unknown,
  profile: IntegrationCredentialProfile,
  env: CredentialEnvironment = currentCredentialEnvironment()
): T {
  const plainConfig = cloneConfig(config);
  for (const field of PROFILE_FIELDS[profile]) {
    const value = plainConfig[field];
    if (typeof value === 'string' && value.length > 0) {
      plainConfig[field] = unprotectCredential(value, contextFor(profile, field), env);
    }
  }
  return plainConfig as T;
}

export function integrationConfigNeedsProtection(
  config: unknown,
  profile: IntegrationCredentialProfile
): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const record = config as Record<string, unknown>;
  return PROFILE_FIELDS[profile].some((field) => {
    const value = record[field];
    return typeof value === 'string' && value.length > 0 && !isProtectedCredential(value);
  });
}

export function integrationConfigNeedsDedicatedKey(
  config: unknown,
  profile: IntegrationCredentialProfile,
  env: CredentialEnvironment = currentCredentialEnvironment()
): boolean {
  if (!env.INTEGRATION_CREDENTIALS_KEY?.trim()) return false;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const record = config as Record<string, unknown>;
  return PROFILE_FIELDS[profile].some((field) => {
    const value = record[field];
    return typeof value === 'string' && value.startsWith(`${ENVELOPE_PREFIX}:s:`);
  });
}

export function hasIntegrationCredential(
  config: unknown,
  profile: IntegrationCredentialProfile,
  field: string
): boolean {
  if (!PROFILE_FIELDS[profile].includes(field)) return false;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const value = (config as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0;
}

export function protectNmsCredential(
  value: string,
  field: NmsCredentialField,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  return protectCredential(value, nmsContextFor(field), env);
}

export function unprotectNmsCredential(
  value: string,
  field: NmsCredentialField,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  return unprotectCredential(value, nmsContextFor(field), env);
}

export function nmsCredentialNeedsProtection(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !isProtectedCredential(value);
}

export function nmsCredentialNeedsDedicatedKey(
  value: unknown,
  env: CredentialEnvironment = currentCredentialEnvironment()
): boolean {
  return Boolean(
    env.INTEGRATION_CREDENTIALS_KEY?.trim()
    && typeof value === 'string'
    && value.startsWith(`${ENVELOPE_PREFIX}:s:`)
  );
}

export function protectNmsBackup(
  value: string,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  return protectCredential(value, NMS_BACKUP_CONTEXT, env);
}

export function unprotectNmsBackup(
  value: string,
  env: CredentialEnvironment = currentCredentialEnvironment()
): string {
  return unprotectCredential(value, NMS_BACKUP_CONTEXT, env);
}
