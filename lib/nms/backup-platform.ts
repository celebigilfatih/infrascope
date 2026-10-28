import profileData from '@/nms_service/ssh/backup_profiles.json';

export const BACKUP_PROFILES = profileData;
export type BackupPlatform = keyof typeof BACKUP_PROFILES;
export type BackupType = 'Running Config' | 'Startup Config';

export function isBackupPlatform(value: unknown): value is BackupPlatform {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BACKUP_PROFILES, value);
}

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

export interface BackupReadiness {
  ready: boolean;
  platform: { id: BackupPlatform; label: string } | null;
  blockers: Array<{ code: string; message: string; action: 'platform' | 'ssh' | null }>;
}

export function getBackupReadiness(device: Parameters<typeof resolveBackupPlatform>[0] & {
  managementIp?: string | null; sshUsername?: string | null; sshPassword?: string | null; sshHostKeyFingerprint?: string | null;
}, role: string): BackupReadiness {
  const platform = resolveBackupPlatform(device);
  const blockers: BackupReadiness['blockers'] = [];
  if (!canManageBackups(role)) blockers.push({ code: 'PERMISSION_REQUIRED', message: 'Yeni yedek başlatmak için yönetici veya düzenleyici yetkisi gerekir.', action: null });
  if (!platform) blockers.push({ code: 'PLATFORM_REQUIRED', message: 'Yedekleme platformu seçilmemiş.', action: 'platform' });
  if (!device.managementIp) blockers.push({ code: 'MANAGEMENT_IP_REQUIRED', message: 'Cihazın yönetim IP adresi eksik.', action: 'ssh' });
  if (!device.sshUsername || !device.sshPassword) blockers.push({ code: 'SSH_CREDENTIALS_REQUIRED', message: 'SSH kullanıcı adı veya kayıtlı parola eksik.', action: 'ssh' });
  if (!device.sshHostKeyFingerprint) blockers.push({ code: 'SSH_HOST_KEY_REQUIRED', message: 'SSH cihaz anahtarı henüz onaylanmamış.', action: 'ssh' });
  return { ready: blockers.length === 0, platform: platform ? { id: platform, label: BACKUP_PROFILES[platform].label } : null, blockers };
}
