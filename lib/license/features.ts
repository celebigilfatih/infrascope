/**
 * Tier-based feature gating for InfraScope SaaS on-premise licenses.
 *
 * Each feature check returns whether the current license tier
 * allows access. Used by middleware, API routes, and UI components.
 */

export type LicenseTier = 'TRIAL' | 'STANDARD' | 'ENTERPRISE';

export interface LicenseLimits {
  tier: LicenseTier;
  maxDevices: number;
  maxUsers: number;
  validUntil: string; // ISO date
  daysRemaining: number;
}

/** Feature definition with per-tier availability */
interface FeatureDef {
  TRIAL: boolean;
  STANDARD: boolean;
  ENTERPRISE: boolean;
}

const FEATURES: Record<string, FeatureDef> = {
  // Core features (always available)
  'dashboard':             { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'devices':               { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'locations':             { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'racks':                 { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'nms':                   { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'alarms':                { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },

  // Integrations (STANDARD+)
  'integrations.vmware':   { TRIAL: false, STANDARD: true,  ENTERPRISE: true },
  'integrations.fortigate':{ TRIAL: false, STANDARD: true,  ENTERPRISE: true },
  'integrations.zabbix':   { TRIAL: false, STANDARD: true,  ENTERPRISE: true },

  // Advanced features (ENTERPRISE only)
  'reports':               { TRIAL: false, STANDARD: true,  ENTERPRISE: true },
  'reports.advanced':      { TRIAL: false, STANDARD: false, ENTERPRISE: true },
  'api.external':          { TRIAL: false, STANDARD: false, ENTERPRISE: true },
  'analytics':             { TRIAL: false, STANDARD: false, ENTERPRISE: true },
  'topology':              { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'services':              { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'audit':                 { TRIAL: false, STANDARD: true,  ENTERPRISE: true },

  // Settings
  'settings.users':        { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
  'settings.license':      { TRIAL: true,  STANDARD: true,  ENTERPRISE: true },
};

/**
 * Check if a feature is available for the given tier.
 */
export function isFeatureAvailable(feature: string, tier: LicenseTier): boolean {
  const def = FEATURES[feature];
  if (!def) return true; // Unknown features default to available
  return def[tier] ?? false;
}

/**
 * Get all available features for a tier.
 */
export function getAvailableFeatures(tier: LicenseTier): string[] {
  return Object.entries(FEATURES)
    .filter(([, def]) => def[tier])
    .map(([name]) => name);
}

/**
 * Get all features with their availability status.
 */
export function getFeatureMatrix(): Record<string, FeatureDef> {
  return { ...FEATURES };
}

/**
 * Check if device count is within license limits.
 */
export function isWithinDeviceLimit(currentCount: number, maxDevices: number): boolean {
  return currentCount <= maxDevices;
}

/**
 * Check if user count is within license limits.
 */
export function isWithinUserLimit(currentCount: number, maxUsers: number): boolean {
  return currentCount <= maxUsers;
}

/**
 * Format license info for display.
 */
export function formatLicenseInfo(limits: LicenseLimits): {
  tierLabel: string;
  tierColor: string;
  statusLabel: string;
  statusColor: string;
  daysLabel: string;
} {
  const tierLabels: Record<LicenseTier, string> = {
    TRIAL: 'Deneme',
    STANDARD: 'Standart',
    ENTERPRISE: 'Kurumsal',
  };

  const tierColors: Record<LicenseTier, string> = {
    TRIAL: 'bg-yellow-100 text-yellow-800',
    STANDARD: 'bg-blue-100 text-blue-800',
    ENTERPRISE: 'bg-purple-100 text-purple-800',
  };

  const daysRemaining = limits.daysRemaining;
  let statusLabel: string;
  let statusColor: string;

  if (daysRemaining <= 0) {
    statusLabel = 'Süresi Dolmuş';
    statusColor = 'bg-red-100 text-red-800';
  } else if (daysRemaining <= 30) {
    statusLabel = `${daysRemaining} gün kaldı`;
    statusColor = 'bg-orange-100 text-orange-800';
  } else {
    statusLabel = 'Aktif';
    statusColor = 'bg-green-100 text-green-800';
  }

  return {
    tierLabel: tierLabels[limits.tier] || limits.tier,
    tierColor: tierColors[limits.tier] || 'bg-gray-100 text-gray-800',
    statusLabel,
    statusColor,
    daysLabel: daysRemaining > 0 ? `${daysRemaining} gün` : 'Süresi dolmuş',
  };
}
