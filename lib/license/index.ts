/**
 * License module barrel export.
 */
export { getMachineId, getMachineIdShort } from './machine-id';
export {
  initLicense,
  revalidateLicense,
  getLicenseState,
  isLicenseValid,
  getLicenseTier,
  getLicenseLimits,
  sendUsageHeartbeat,
} from './client';
export type { LicenseState } from './client';
export {
  isFeatureAvailable,
  getAvailableFeatures,
  getFeatureMatrix,
  isWithinDeviceLimit,
  isWithinUserLimit,
  formatLicenseInfo,
} from './features';
export type { LicenseTier, LicenseLimits } from './features';
export {
  checkLicense,
  checkFeature,
  checkDeviceLimit,
  checkUserLimit,
  getLicenseInfo,
  getAdminLicenseInfo,
} from './middleware';

