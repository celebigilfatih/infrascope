export interface AddNmsForm {
  deviceId: string; managementIp: string; snmpPort: number; snmpVersion: 'v2c' | 'v3';
  snmpCommunity: string; snmpV3Username: string; snmpV3SecurityLevel: 'authNoPriv' | 'authPriv';
  snmpV3AuthProtocol: string; snmpV3AuthPassword: string; snmpV3PrivacyProtocol: string; snmpV3PrivacyPassword: string;
  pollingInterval: number; pollingEnabled: boolean; sshUsername: string; sshPassword: string; sshPort: number;
}
export function validManagementIp(value: string) {
  const ip = value.trim();
  if (ip.includes(':')) {
    try { const host = new URL(`http://[${ip}]/`).hostname.toLowerCase(); return host.startsWith('[') && host !== '[::]' && !host.startsWith('[ff'); } catch { return false; }
  }
  const first = Number(ip.split('.')[0]);
  return ip !== '0.0.0.0' && ip !== '255.255.255.255' && !(first >= 224 && first <= 239) && /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255);
}
export function validateAddNmsForm(form: AddNmsForm, sshEnabled: boolean) {
  const errors: Record<string, string> = {};
  if (!form.deviceId) errors.device = 'İzlemeye alınacak cihazı seçin.';
  if (!validManagementIp(form.managementIp)) errors.managementIp = 'Geçerli bir IPv4 veya IPv6 yönetim adresi girin.';
  if (!Number.isInteger(form.snmpPort) || form.snmpPort < 1 || form.snmpPort > 65535) errors.snmpPort = '1–65535 arasında bir port girin.';
  if (!Number.isInteger(form.pollingInterval) || form.pollingInterval < 30 || form.pollingInterval > 86400) errors.pollingInterval = '30–86400 arasında bir saniye değeri girin.';
  if (form.snmpVersion === 'v2c') {
    if (!form.snmpCommunity.trim()) errors.snmpCommunity = 'Topluluk adını (community) girin.';
    else if (form.snmpCommunity.length > 255) errors.snmpCommunity = 'En fazla 255 karakter girin.';
  } else {
    if (!form.snmpV3Username.trim() || form.snmpV3Username.trim().length > 64 || !/^[\x21-\x7e]+$/.test(form.snmpV3Username.trim())) errors.snmpV3Username = '1–64 karakter kullanın; boşluk ve Türkçe karakter kullanmayın.';
    if (form.snmpV3AuthPassword.length < 8 || form.snmpV3AuthPassword.length > 255) errors.snmpV3AuthPassword = '8–255 karakterlik doğrulama parolası girin.';
    if (form.snmpV3SecurityLevel === 'authPriv' && (form.snmpV3PrivacyPassword.length < 8 || form.snmpV3PrivacyPassword.length > 255)) errors.snmpV3PrivacyPassword = '8–255 karakterlik şifreleme parolası girin.';
  }
  if (sshEnabled) {
    if (!form.sshUsername.trim()) errors.sshUsername = 'SSH kullanıcı adını girin.';
    if (!Number.isInteger(form.sshPort) || form.sshPort < 1 || form.sshPort > 65535) errors.sshPort = '1–65535 arasında bir port girin.';
  }
  return errors;
}
export function snmpTestPayload(form: AddNmsForm) {
  return {
    deviceId: form.deviceId, managementIp: form.managementIp.trim(), snmpPort: form.snmpPort, snmpVersion: form.snmpVersion,
    ...(form.snmpVersion === 'v2c' ? { snmpCommunity: form.snmpCommunity } : {
      snmpV3Username: form.snmpV3Username.trim(), snmpV3SecurityLevel: form.snmpV3SecurityLevel,
      snmpV3AuthProtocol: form.snmpV3AuthProtocol, snmpV3AuthPassword: form.snmpV3AuthPassword,
      ...(form.snmpV3SecurityLevel === 'authPriv' ? { snmpV3PrivacyProtocol: form.snmpV3PrivacyProtocol, snmpV3PrivacyPassword: form.snmpV3PrivacyPassword } : {}),
    }),
  };
}
export function addNmsPayload(form: AddNmsForm, sshEnabled: boolean) {
  return { ...snmpTestPayload(form), pollingInterval: form.pollingInterval, pollingEnabled: form.pollingEnabled,
    sshUsername: sshEnabled ? form.sshUsername.trim() || null : null,
    sshPassword: sshEnabled ? form.sshPassword || null : null, sshPort: sshEnabled ? form.sshPort : 22 };
}
export function affectsSnmpTest(key: keyof AddNmsForm) {
  return key === 'deviceId' || key === 'managementIp' || key.startsWith('snmp');
}
export interface SnmpTestResult { reachable: boolean; outcome: 'response' | 'no_response'; checkedAt: string; durationMs: number; systemName: string | null; uptimeSeconds: number | null }
export function parseSnmpTestResult(value: unknown): SnmpTestResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.reachable !== 'boolean' || row.outcome !== (row.reachable ? 'response' : 'no_response') || typeof row.checkedAt !== 'string' || !Number.isFinite(Date.parse(row.checkedAt)) || typeof row.durationMs !== 'number' || !Number.isFinite(row.durationMs) || row.durationMs < 0) return null;
  return { reachable: row.reachable, outcome: row.reachable ? 'response' : 'no_response', checkedAt: row.checkedAt, durationMs: row.durationMs,
    systemName: typeof row.systemName === 'string' ? row.systemName.slice(0, 255) : null,
    uptimeSeconds: typeof row.uptimeSeconds === 'number' && Number.isFinite(row.uptimeSeconds) && row.uptimeSeconds >= 0 ? row.uptimeSeconds : null };
}
