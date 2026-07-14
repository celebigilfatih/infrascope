import { isIP } from 'node:net';
import {
  NmsSnmpValidationError,
  normalizeSnmpV3AuthProtocol,
  normalizeSnmpV3PrivacyProtocol,
  normalizeSnmpV3SecurityLevel,
  normalizeSnmpV3Username,
  normalizeSnmpVersion,
  validateSnmpCommunity,
  validateSnmpV3Secret,
  type SnmpV3AuthProtocol,
  type SnmpV3PrivacyProtocol,
  type SnmpV3SecurityLevel,
} from '../nms/snmp-config';
import { normalizeFortiGateVdom } from './target';

type FirewallSnmpV2Input = {
  version: '1' | '2c';
  community: string;
  port: number;
  pollingInterval: number;
};

type FirewallSnmpV3Input = {
  version: '3';
  username: string;
  securityLevel: SnmpV3SecurityLevel;
  authProtocol: SnmpV3AuthProtocol;
  authPassword: string;
  privacyProtocol: SnmpV3PrivacyProtocol | null;
  privacyPassword: string | null;
  port: number;
  pollingInterval: number;
};

export type FirewallOnboardingInput = {
  name: string;
  host: string;
  vdom: string;
  username?: string;
  password?: string;
  accessToken?: string;
  model?: string;
  snmp?: FirewallSnmpV2Input | FirewallSnmpV3Input;
  ssh?: {
    username: string;
    password: string;
    port: number;
  };
};

export class FirewallOnboardingValidationError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_FIREWALL_INPUT';
}

function isValidHostname(host: string): boolean {
  if (host.length > 253 || host.includes('..')) return false;
  if (/^\d+(?:\.\d+){3}$/.test(host)) return false;
  return host.split('.').every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

export function normalizeFirewallManagementHost(value: unknown): string {
  const host = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!host || (isIP(host) !== 4 && !isValidHostname(host))) {
    throw new FirewallOnboardingValidationError('Firewall host must be a valid hostname or IPv4 address without protocol or path');
  }
  return host;
}

export function normalizeFirewallOnboardingInput(input: unknown): FirewallOnboardingInput {
  if (!input || typeof input !== 'object') {
    throw new FirewallOnboardingValidationError('Firewall input is required');
  }
  const body = input as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const host = normalizeFirewallManagementHost(body.host);
  if (!name || name.length > 120) {
    throw new FirewallOnboardingValidationError('Firewall name is required and must be at most 120 characters');
  }
  const username = typeof body.username === 'string' ? body.username.trim() : undefined;
  const password = typeof body.password === 'string' ? body.password : undefined;
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : undefined;
  if ((!username || !password) && !accessToken) {
    throw new FirewallOnboardingValidationError('A read-only username/password or API token is required');
  }

  const rawSnmp = body.snmp && typeof body.snmp === 'object'
    ? body.snmp as Record<string, unknown>
    : null;
  const rawSsh = body.ssh && typeof body.ssh === 'object'
    ? body.ssh as Record<string, unknown>
    : null;
  let vdom: string;
  try {
    vdom = normalizeFortiGateVdom(typeof body.vdom === 'string' ? body.vdom : undefined);
  } catch {
    throw new FirewallOnboardingValidationError('FortiGate VDOM is invalid');
  }

  let snmp: FirewallOnboardingInput['snmp'];
  if (rawSnmp) {
    try {
      const version = normalizeSnmpVersion(rawSnmp.version);
      const port = normalizePort(rawSnmp.port, 161, 'SNMP');
      const pollingInterval = normalizePollingInterval(rawSnmp.pollingInterval);
      if (version === '3') {
        const securityLevel = normalizeSnmpV3SecurityLevel(rawSnmp.securityLevel);
        snmp = {
          version,
          username: normalizeSnmpV3Username(rawSnmp.username),
          securityLevel,
          authProtocol: normalizeSnmpV3AuthProtocol(rawSnmp.authProtocol),
          authPassword: validateSnmpV3Secret(rawSnmp.authPassword, 'SNMPv3 authentication password'),
          privacyProtocol: securityLevel === 'authPriv'
            ? normalizeSnmpV3PrivacyProtocol(rawSnmp.privacyProtocol)
            : null,
          privacyPassword: securityLevel === 'authPriv'
            ? validateSnmpV3Secret(rawSnmp.privacyPassword, 'SNMPv3 privacy password')
            : null,
          port,
          pollingInterval,
        };
      } else {
        snmp = {
          version,
          community: validateSnmpCommunity(rawSnmp.community),
          port,
          pollingInterval,
        };
      }
    } catch (error) {
      if (error instanceof NmsSnmpValidationError) {
        throw new FirewallOnboardingValidationError(error.message);
      }
      throw error;
    }
  }

  let ssh: FirewallOnboardingInput['ssh'];
  if (rawSsh) {
    const sshUsername = typeof rawSsh.username === 'string' ? rawSsh.username.trim() : '';
    const sshPassword = typeof rawSsh.password === 'string' ? rawSsh.password : '';
    if (!sshUsername || !sshPassword) {
      throw new FirewallOnboardingValidationError('SSH username and password are required when SSH fallback is enabled');
    }
    ssh = {
      username: sshUsername,
      password: sshPassword,
      port: normalizePort(rawSsh.port, 22, 'SSH'),
    };
  }

  return {
    name,
    host,
    vdom,
    username,
    password,
    accessToken,
    model: typeof body.model === 'string' ? body.model.trim() || undefined : undefined,
    snmp,
    ssh,
  };
}

function normalizePort(value: unknown, fallback: number, label: string): number {
  const port = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new FirewallOnboardingValidationError(`${label} port must be between 1 and 65535`);
  }
  return port;
}

function normalizePollingInterval(value: unknown): number {
  const seconds = value === undefined || value === null || value === '' ? 300 : Number(value);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86400) {
    throw new FirewallOnboardingValidationError('SNMP polling interval must be between 10 and 86400 seconds');
  }
  return seconds;
}
