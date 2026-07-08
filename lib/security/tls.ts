import fs from 'fs';
import type { RequestOptions } from 'https';
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

function getTlsMaterial(integration: TlsIntegration): { rejectUnauthorized: boolean; ca?: string } {
  assertProductionTlsSafe();

  const config = TLS_CONFIG[integration];
  const insecure = isTruthy(process.env[config.insecureEnv]);
  if (insecure) {
    return { rejectUnauthorized: false };
  }

  const caCertPath = process.env[config.caCertPathEnv];
  if (caCertPath) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caCertPath, 'utf8'),
    };
  }

  return { rejectUnauthorized: true };
}

function getAgent(integration: TlsIntegration): Agent {
  const tls = getTlsMaterial(integration);
  const cacheKey = `${integration}:${tls.rejectUnauthorized}:${tls.ca ? tls.ca.length : 0}`;
  const cached = agentCache.get(cacheKey);
  if (cached) return cached;

  const agent = new Agent({
    connect: tls,
  });
  agentCache.set(cacheKey, agent);
  return agent;
}

export function getHttpsRequestTlsOptions(integration: TlsIntegration): Pick<RequestOptions, 'ca' | 'rejectUnauthorized'> {
  return getTlsMaterial(integration);
}

export function secureFetch(
  integration: TlsIntegration,
  url: string | URL,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    dispatcher: getAgent(integration),
  } as RequestInit & { dispatcher: Agent });
}
