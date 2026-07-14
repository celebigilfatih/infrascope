export class FortiGateTargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FortiGateTargetValidationError';
  }
}

export type FortiGateTargetSelector = {
  configId?: string;
  vdom?: string;
  includeDisabled?: boolean;
};

export function fortiGateTargetSelectorFromUrl(url: string): FortiGateTargetSelector {
  const searchParams = new URL(url).searchParams;
  return {
    configId: searchParams.get('configId') || undefined,
    vdom: searchParams.get('vdom') || undefined,
  };
}

export function normalizeFortiGateVdom(value?: string): string {
  const vdom = value?.trim() || 'root';
  if (vdom.length > 79 || /[\u0000-\u001f\u007f]/.test(vdom)) {
    throw new FortiGateTargetValidationError('FortiGate VDOM is invalid');
  }
  return vdom;
}
