import fs from 'fs';
import { createHash } from 'crypto';
import type { RequestOptions } from 'https';
import { rootCertificates } from 'tls';
import { Agent } from 'undici';

export type TlsIntegration = 'FORTIANALYZER' | 'FORTIGATE' | 'VMWARE';

type TlsConfig = {
  caCertPathEnv: string;
  insecureEnv: string;
};

const TLS_CONFIG: Record<TlsIntegration, TlsConfig> = {
  FORTIANALYZER: {
    caCertPathEnv: 'FORTIANALYZER_TLS_CA_CERT_PATH',
    insecureEnv: 'FORTIANALYZER_TLS_INSECURE',
  },
  FORTIGATE: {
    caCertPathEnv: 'FORTIGATE_TLS_CA_CERT_PATH',
    insecureEnv: 'FORTIGATE_TLS_INSECURE',
  },
  VMWARE: {
    caCertPathEnv: 'VMWARE_TLS_CA_CERT_PATH',
    insecureEnv: 'VMWARE_TLS_INSECURE',
  },
};

const agentCache = new Map<string, Agent>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isTruthy(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

export function assertProductionTlsSafe(): void {
  if (isProduction() && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error(
      'NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden in production. Configure a CA certificate path instead.'
    );
  }

  if (!isProduction()) return;

  for (const [integration, config] of Object.entries(TLS_CONFIG)) {
    if (isTruthy(process.env[config.insecureEnv])) {
      throw new Error(
        `${config.insecureEnv}=true is forbidden in production for ${integration}. Configure ${config.caCertPathEnv} instead.`
      );
    }
  }
}

type TlsOverrides = { caPem?: string };

function systemRootsWith(ca: string): string[] {
  return [...rootCertificates, ca];
}

function getTlsMaterial(integration: TlsIntegration, overrides: TlsOverrides = {}): { rejectUnauthorized: boolean; ca?: string | string[] } {
  assertProductionTlsSafe();

  const config = TLS_CONFIG[integration];
  const insecure = isTruthy(process.env[config.insecureEnv]);
  if (insecure) {
    return { rejectUnauthorized: false };
  }

  if (overrides.caPem?.trim()) {
    return { rejectUnauthorized: true, ca: systemRootsWith(overrides.caPem) };
  }

  const caCertPath = process.env[config.caCertPathEnv];
  if (caCertPath) {
    return {
      rejectUnauthorized: true,
      ca: systemRootsWith(fs.readFileSync(caCertPath, 'utf8')),
    };
  }

  return { rejectUnauthorized: true };
}

function getAgent(integration: TlsIntegration, overrides: TlsOverrides = {}): Agent {
  const tls = getTlsMaterial(integration, overrides);
  const caFingerprint = tls.ca
    ? createHash('sha256').update(Array.isArray(tls.ca) ? tls.ca.join('\n') : tls.ca).digest('hex')
    : 'system';
  const cacheKey = `${integration}:${tls.rejectUnauthorized}:${caFingerprint}`;
  const cached = agentCache.get(cacheKey);
  if (cached) return cached;

  const agent = new Agent({
    connect: tls,
  });
  agentCache.set(cacheKey, agent);
  return agent;
}

export function getHttpsRequestTlsOptions(integration: TlsIntegration, overrides: TlsOverrides = {}): Pick<RequestOptions, 'ca' | 'rejectUnauthorized'> {
  return getTlsMaterial(integration, overrides);
}

export function secureFetch(
  integration: TlsIntegration,
  url: string | URL,
  options: RequestInit & { timeoutMs?: number; caPem?: string } = {}
): Promise<Response> {
  const { timeoutMs = 30_000, caPem, ...requestOptions } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = requestOptions.signal
    ? AbortSignal.any([requestOptions.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(url, {
    ...requestOptions,
    signal,
    dispatcher: getAgent(integration, { caPem }),
  } as RequestInit & { dispatcher: Agent });
}
