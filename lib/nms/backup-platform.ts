import profileData from '@/nms_service/ssh/backup_profiles.json';

export const BACKUP_PROFILES = profileData;
export type BackupPlatform = keyof typeof BACKUP_PROFILES;
export type BackupType = 'Running Config' | 'Startup Config';

export function resolveBackupPlatform(device: {
  backupPlatform?: string | null; vendor?: string | null; model?: string | null; operatingSystem?: string | null;
}): BackupPlatform | null {
  if (device.backupPlatform) return Object.prototype.hasOwnProperty.call(BACKUP_PROFILES, device.backupPlatform) ? device.backupPlatform as BackupPlatform : null;
  const identity = `${device.operatingSystem || ''} ${device.vendor || ''} ${device.model || ''}`.toLowerCase();
  if (/comware|h3c|\b(51|55|58)\d{2}\b/.test(identity)) return 'comware';
  if (/aruba.?os.?cx|aos.?cx/.test(identity)) return 'aruba_cx';
  if (/procurve|arubaos.?switch|aos.?s\b|\b(25|26|28|29|38)\d{2}\b/.test(identity)) return 'aruba_switch';
  if (/huawei|\bvrp\b/.test(identity)) return 'huawei_vrp';
  if (/juniper|junos/.test(identity)) return 'junos';
  if (/fortinet|fortigate|fortios/.test(identity)) return 'fortios';
  if (/mikrotik|routeros/.test(identity)) return 'routeros';
  if (/arista|\beos\b/.test(identity)) return 'arista_eos';
  if (/nx.?os|nexus/.test(identity)) return 'cisco_nxos';
  if (/cisco|\bios\b/.test(identity)) return 'cisco_ios';
  // HP and Aruba span incompatible operating systems. Require a profile if metadata is ambiguous.
  return null;
}

export function supportsBackupType(platform: BackupPlatform | null, type: string): type is BackupType {
  return !!platform && (type === 'Running Config' || (type === 'Startup Config' && !!BACKUP_PROFILES[platform].startup));
}

export function canManageBackups(role: string): boolean {
  return role === 'ADMIN' || role === 'EDITOR';
}
