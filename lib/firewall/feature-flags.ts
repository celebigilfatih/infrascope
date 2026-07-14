export const LEGACY_FIREWALL_WRITES_ENV = 'FORTIGATE_LEGACY_WRITES_ENABLED';

export function areLegacyFirewallWritesEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[LEGACY_FIREWALL_WRITES_ENV]?.trim().toLowerCase() === 'true';
}
