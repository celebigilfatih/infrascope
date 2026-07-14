import { createHash, X509Certificate } from 'node:crypto';

const CERTIFICATE_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/;
const MAX_BUNDLE_BYTES = 256 * 1024;
const MAX_CERTIFICATES = 10;

export type TrustedCaBundleSummary = {
  certificateCount: number;
  subjects: string[];
  validUntil: string;
  fingerprint: string;
};

function certificateBlocks(input: string): string[] {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  if (!normalized) throw new Error('CA certificate file is empty.');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_BUNDLE_BYTES) {
    throw new Error('CA certificate file must be smaller than 256 KB.');
  }
  if (PRIVATE_KEY_PATTERN.test(normalized)) {
    throw new Error('Private keys cannot be uploaded. Upload only the CA certificate chain.');
  }

  const blocks = normalized.match(CERTIFICATE_PATTERN) || [];
  if (blocks.length === 0) {
    throw new Error('The selected file does not contain a PEM certificate.');
  }
  if (blocks.length > MAX_CERTIFICATES) {
    throw new Error(`A maximum of ${MAX_CERTIFICATES} CA certificates can be uploaded at once.`);
  }
  const remaining = normalized.replace(CERTIFICATE_PATTERN, '').trim();
  if (remaining) {
    throw new Error('The CA file contains unsupported content. Upload a PEM CA chain only.');
  }
  return blocks;
}

export function inspectTrustedCaBundle(input: string): TrustedCaBundleSummary {
  const certificates = certificateBlocks(input).map((block) => new X509Certificate(block));
  if (certificates.some((certificate) => !certificate.ca)) {
    throw new Error('The uploaded chain contains a non-CA certificate. Upload the issuing CA certificate chain.');
  }
  const validUntil = certificates
    .map((certificate) => new Date(certificate.validTo))
    .sort((left, right) => left.getTime() - right.getTime())[0];
  if (validUntil.getTime() <= Date.now()) {
    throw new Error('The uploaded CA certificate chain has expired.');
  }
  const normalized = certificates.map((certificate) => certificate.toString().trim()).join('\n') + '\n';
  return {
    certificateCount: certificates.length,
    subjects: certificates.map((certificate) => certificate.subject).slice(0, 3),
    validUntil: validUntil.toISOString(),
    fingerprint: createHash('sha256').update(normalized).digest('hex'),
  };
}

export function normalizeTrustedCaBundle(input: string): { pem: string; summary: TrustedCaBundleSummary } {
  const summary = inspectTrustedCaBundle(input);
  const pem = certificateBlocks(input)
    .map((block) => new X509Certificate(block).toString().trim())
    .join('\n') + '\n';
  return { pem, summary };
}
