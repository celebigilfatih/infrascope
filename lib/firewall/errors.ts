export type FirewallErrorCode =
  | 'TLS_CERTIFICATE_EXPIRED'
  | 'TLS_CERTIFICATE_UNTRUSTED'
  | 'AUTHENTICATION_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'REQUEST_TIMEOUT'
  | 'NETWORK_UNREACHABLE'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_OPERATION'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export class FirewallIntegrationError extends Error {
  constructor(
    public readonly code: FirewallErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly responseStatus: number,
    options?: { cause?: unknown; upstreamStatus?: number }
  ) {
    super(message);
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = 'FirewallIntegrationError';
    this.upstreamStatus = options?.upstreamStatus;
  }

  readonly upstreamStatus?: number;
}

function errorFacts(error: unknown): { message: string; code: string } {
  const messages: string[] = [];
  let code = '';
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      const record = current as Error & { code?: unknown; cause?: unknown };
      if (!code && typeof record.code === 'string') code = record.code;
      current = record.cause;
    } else if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (typeof record.message === 'string') messages.push(record.message);
      if (!code && typeof record.code === 'string') code = record.code;
      current = record.cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return { message: messages.join(' ').toLowerCase(), code: code.toUpperCase() };
}

export function classifyFortiGateError(error: unknown): FirewallIntegrationError {
  if (error instanceof FirewallIntegrationError) return error;
  const facts = errorFacts(error);

  if (
    facts.code === 'CERT_HAS_EXPIRED' ||
    facts.message.includes('certificate has expired') ||
    facts.message.includes('certificate expired')
  ) {
    return new FirewallIntegrationError(
      'TLS_CERTIFICATE_EXPIRED',
      'FortiGate TLS certificate has expired',
      false,
      503,
      { cause: error }
    );
  }

  if (
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_SIGNATURE_FAILURE'].includes(facts.code) ||
    facts.message.includes('self-signed certificate') ||
    facts.message.includes('unable to verify the first certificate') ||
    facts.message.includes('certificate verify failed')
  ) {
    return new FirewallIntegrationError(
      'TLS_CERTIFICATE_UNTRUSTED',
      'FortiGate TLS certificate is not trusted',
      false,
      503,
      { cause: error }
    );
  }

  if (
    facts.code === 'ABORT_ERR' ||
    facts.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    facts.message.includes('timeout') ||
    facts.message.includes('timed out') ||
    facts.message.includes('the operation was aborted')
  ) {
    return new FirewallIntegrationError(
      'REQUEST_TIMEOUT',
      'FortiGate request timed out',
      true,
      504,
      { cause: error }
    );
  }

  if (
    ['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(facts.code) ||
    facts.message.includes('fetch failed') ||
    facts.message.includes('socket hang up')
  ) {
    return new FirewallIntegrationError(
      'NETWORK_UNREACHABLE',
      'FortiGate network endpoint is unreachable',
      true,
      503,
      { cause: error }
    );
  }

  if (facts.message.includes('locked') || facts.message.includes('code -22')) {
    return new FirewallIntegrationError(
      'ACCOUNT_LOCKED',
      'FortiGate account is locked',
      false,
      502,
      { cause: error }
    );
  }

  if (
    facts.message.includes('login failed') ||
    facts.message.includes('no apscookie') ||
    facts.message.includes('unauthorized') ||
    facts.message.includes('forbidden')
  ) {
    return new FirewallIntegrationError(
      'AUTHENTICATION_FAILED',
      'FortiGate authentication failed',
      false,
      502,
      { cause: error }
    );
  }

  return new FirewallIntegrationError(
    'UNKNOWN',
    'FortiGate request failed',
    false,
    502,
    { cause: error }
  );
}

export function createFortiGateHttpError(
  status: number,
  responseBody = ''
): FirewallIntegrationError {
  const normalizedBody = responseBody.toLowerCase();
  if (normalizedBody.includes('locked') || normalizedBody.includes('"code":-22')) {
    return new FirewallIntegrationError('ACCOUNT_LOCKED', 'FortiGate account is locked', false, 502, { upstreamStatus: status });
  }
  if (status === 401 || status === 403) {
    return new FirewallIntegrationError('AUTHENTICATION_FAILED', 'FortiGate authentication failed', false, 502, { upstreamStatus: status });
  }
  if (status === 404 || status === 405 || status === 501) {
    return new FirewallIntegrationError('UNSUPPORTED_OPERATION', 'FortiGate operation is not supported', false, 501, { upstreamStatus: status });
  }
  if (status === 429) {
    return new FirewallIntegrationError('RATE_LIMITED', 'FortiGate rate limit was reached', true, 503, { upstreamStatus: status });
  }
  if (status >= 500) {
    return new FirewallIntegrationError('UPSTREAM_UNAVAILABLE', 'FortiGate service is unavailable', true, 503, { upstreamStatus: status });
  }
  return new FirewallIntegrationError('UPSTREAM_UNAVAILABLE', 'FortiGate request was rejected', false, 502, { upstreamStatus: status });
}

export function firewallErrorPayload(error: unknown): {
  error: string;
  code: FirewallErrorCode;
  retryable: boolean;
  status: number;
} {
  const classified = classifyFortiGateError(error);
  return {
    error: classified.message,
    code: classified.code,
    retryable: classified.retryable,
    status: classified.responseStatus,
  };
}
