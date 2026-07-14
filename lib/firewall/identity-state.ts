export function normalizeFortiGateSerial(serial: string): string {
  const normalized = serial.trim().toUpperCase();
  if (!normalized || normalized.length > 128 || !/^[A-Z0-9-]+$/.test(normalized)) {
    throw new Error('FortiGate serial is invalid');
  }
  return normalized;
}

export function buildFortiGateIdentityKey(serial: string, vdom: string): string {
  return `${normalizeFortiGateSerial(serial)}::${vdom.trim().toLowerCase() || 'root'}`;
}

export type FortiGateIdentityDecision =
  | {
      status: 'VERIFIED';
      identityKey: string;
      identityCandidateKey: null;
      identityConflictWithId: null;
    }
  | {
      status: 'CONFLICT';
      identityKey: string | null;
      identityCandidateKey: string;
      identityConflictWithId: string | null;
    };

export function decideFortiGateIdentity(input: {
  connectorId: string;
  currentIdentityKey: string | null;
  candidateKey: string;
  candidateOwnerId: string | null;
}): FortiGateIdentityDecision {
  const ownerConflict = Boolean(
    input.candidateOwnerId && input.candidateOwnerId !== input.connectorId
  );
  const currentConflict = Boolean(
    input.currentIdentityKey && input.currentIdentityKey !== input.candidateKey
  );
  if (ownerConflict || currentConflict) {
    return {
      status: 'CONFLICT',
      identityKey: input.currentIdentityKey,
      identityCandidateKey: input.candidateKey,
      identityConflictWithId: ownerConflict ? input.candidateOwnerId : null,
    };
  }
  return {
    status: 'VERIFIED',
    identityKey: input.candidateKey,
    identityCandidateKey: null,
    identityConflictWithId: null,
  };
}
