import assert from 'node:assert/strict';
import {
  classifyFortiGateError,
  createFortiGateHttpError,
} from '../lib/firewall/errors';

function expectClassification(
  error: unknown,
  expectedCode: ReturnType<typeof classifyFortiGateError>['code'],
  retryable: boolean
) {
  const classified = classifyFortiGateError(error);
  assert.equal(classified.code, expectedCode);
  assert.equal(classified.retryable, retryable);
}

const expired = Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
expectClassification(expired, 'TLS_CERTIFICATE_EXPIRED', false);

const networkCause = Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
const fetchFailure = Object.assign(new TypeError('fetch failed'), { cause: networkCause });
expectClassification(fetchFailure, 'NETWORK_UNREACHABLE', true);

const timeout = Object.assign(new Error('The operation was aborted'), { code: 'ABORT_ERR' });
expectClassification(timeout, 'REQUEST_TIMEOUT', true);

expectClassification(createFortiGateHttpError(401), 'AUTHENTICATION_FAILED', false);
expectClassification(createFortiGateHttpError(429), 'RATE_LIMITED', true);
expectClassification(createFortiGateHttpError(503), 'UPSTREAM_UNAVAILABLE', true);
expectClassification(createFortiGateHttpError(404), 'UNSUPPORTED_OPERATION', false);
expectClassification(createFortiGateHttpError(403, '{"code":-22,"message":"locked"}'), 'ACCOUNT_LOCKED', false);

console.log('FortiGate error classification checks passed.');
