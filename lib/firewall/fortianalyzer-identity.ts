import { normalizeFortiGateSerial } from './identity-state';
import { normalizeFortiGateVdom } from './target';

export type FortiAnalyzerManagedDevice = {
  devid?: unknown;
  name?: unknown;
  ip?: unknown;
  platform?: unknown;
};

export type FortiAnalyzerIdentityDecision =
  | { status: 'VERIFIED'; analyzerDeviceId: string; vdom: string }
  | { status: 'NOT_FOUND'; analyzerDeviceId: null; vdom: string }
  | { status: 'AMBIGUOUS'; analyzerDeviceId: null; vdom: string };

export function normalizeFortiAnalyzerDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return normalizeFortiGateSerial(value);
  } catch {
    return null;
  }
}

export function decideFortiAnalyzerIdentity(params: {
  serialNumber: string;
  vdom: string;
  devices: FortiAnalyzerManagedDevice[];
}): FortiAnalyzerIdentityDecision {
  const serial = normalizeFortiGateSerial(params.serialNumber);
  const vdom = normalizeFortiGateVdom(params.vdom).toLowerCase();
  const matches = params.devices
    .map((device) => normalizeFortiAnalyzerDeviceId(device.devid))
    .filter((devid): devid is string => devid === serial);
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 0) return { status: 'NOT_FOUND', analyzerDeviceId: null, vdom };
  if (uniqueMatches.length > 1) return { status: 'AMBIGUOUS', analyzerDeviceId: null, vdom };
  return { status: 'VERIFIED', analyzerDeviceId: uniqueMatches[0], vdom };
}
