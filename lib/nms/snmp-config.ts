export type SnmpVersion = '1' | '2c' | '3';
export type SnmpV3SecurityLevel = 'authNoPriv' | 'authPriv';
export type SnmpV3AuthProtocol = 'SHA' | 'SHA-256';
export type SnmpV3PrivacyProtocol = 'AES';

export class NmsSnmpValidationError extends Error {
  readonly status = 400;
}

export function normalizeSnmpVersion(value: unknown, fallback: SnmpVersion = '2c'): SnmpVersion {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'v1') return '1';
  if (normalized === '2c' || normalized === 'v2c') return '2c';
  if (normalized === '3' || normalized === 'v3') return '3';
  throw new NmsSnmpValidationError('SNMP version must be v1, v2c or v3');
}

export function normalizeSnmpV3Username(value: unknown): string {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!username || username.length > 64 || !/^[\x21-\x7e]+$/.test(username)) {
    throw new NmsSnmpValidationError('SNMPv3 username must contain 1-64 visible ASCII characters without spaces');
  }
  return username;
}

export function normalizeSnmpV3SecurityLevel(value: unknown): SnmpV3SecurityLevel {
  if (value === undefined || value === null || value === '') return 'authPriv';
  if (value === 'authNoPriv' || value === 'authPriv') return value;
  throw new NmsSnmpValidationError('SNMPv3 security level must be authNoPriv or authPriv');
}

export function normalizeSnmpV3AuthProtocol(value: unknown): SnmpV3AuthProtocol {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'SHA';
  if (normalized === 'SHA' || normalized === 'SHA-1') return 'SHA';
  if (normalized === 'SHA256' || normalized === 'SHA-256') return 'SHA-256';
  throw new NmsSnmpValidationError('SNMPv3 authentication protocol must be SHA or SHA-256');
}

export function normalizeSnmpV3PrivacyProtocol(value: unknown): SnmpV3PrivacyProtocol {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'AES';
  if (normalized === 'AES' || normalized === 'AES128' || normalized === 'AES-128') return 'AES';
  throw new NmsSnmpValidationError('SNMPv3 privacy protocol must be AES');
}

export function validateSnmpV3Secret(value: unknown, label: string): string {
  const secret = typeof value === 'string' ? value : '';
  if (secret.length < 8 || secret.length > 255) {
    throw new NmsSnmpValidationError(`${label} must contain 8-255 characters`);
  }
  return secret;
}

export function validateSnmpCommunity(value: unknown): string {
  const community = typeof value === 'string' ? value : '';
  if (!community || community.length > 255) {
    throw new NmsSnmpValidationError('SNMP community must contain 1-255 characters');
  }
  return community;
}
