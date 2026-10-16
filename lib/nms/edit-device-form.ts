export type SnmpVersion = 'v1' | 'v2c' | 'v3';
export type SnmpV3SecurityLevel = 'authNoPriv' | 'authPriv';

export interface EditableNmsDevice {
  id: string;
  name: string;
  type: string | null;
  vendor: string | null;
  managementIp: string | null;
  snmpVersion: string | null;
  snmpPort: number | null;
  snmpV3Username: string | null;
  snmpV3SecurityLevel: string | null;
  snmpV3AuthProtocol: string | null;
  snmpV3PrivacyProtocol: string | null;
  pollingEnabled: boolean;
  pollingInterval: number | null;
  sshUsername: string | null;
  sshPort: number | null;
  hasSnmpCommunity: boolean;
  hasSnmpV3AuthPassword: boolean;
  hasSnmpV3PrivacyPassword: boolean;
  hasSshPassword: boolean;
  sshHostKeyAlgorithm: string | null;
  sshHostKeyFingerprint: string | null;
}

export function createEditForm(device?: EditableNmsDevice | null) {
  return {
    managementIp: device?.managementIp || '',
    snmpPort: device?.snmpPort ?? 161,
    snmpVersion: (device?.snmpVersion === '3' || device?.snmpVersion === 'v3' ? 'v3' : device?.snmpVersion === '1' || device?.snmpVersion === 'v1' ? 'v1' : 'v2c') as SnmpVersion,
    snmpCommunity: '',
    snmpV3Username: device?.snmpV3Username || '',
    snmpV3SecurityLevel: (device?.snmpV3SecurityLevel === 'authNoPriv' ? 'authNoPriv' : 'authPriv') as SnmpV3SecurityLevel,
    snmpV3AuthProtocol: device?.snmpV3AuthProtocol || 'SHA',
    snmpV3AuthPassword: '',
    snmpV3PrivacyProtocol: device?.snmpV3PrivacyProtocol || 'AES',
    snmpV3PrivacyPassword: '',
    pollingEnabled: device?.pollingEnabled ?? true,
    pollingInterval: device?.pollingInterval ?? 300,
    sshUsername: device?.sshUsername || '',
    sshPassword: '',
    sshPort: device?.sshPort ?? 22,
  };
}
export type NmsEditForm = ReturnType<typeof createEditForm>;

export function validateEditForm(form: NmsEditForm, device: EditableNmsDevice) {
  const errors: Record<string, string> = {};
  if (!form.managementIp.trim()) errors['management-ip'] = 'Yönetim IP adresini girin.';
  if (!Number.isInteger(form.snmpPort) || form.snmpPort < 1 || form.snmpPort > 65535) errors['snmp-port'] = '1–65535 arasında bir port girin.';
  if (!Number.isInteger(form.pollingInterval) || form.pollingInterval < 10 || form.pollingInterval > 86400) errors['polling-interval'] = '10–86400 arasında bir saniye değeri girin.';
  if (form.snmpVersion !== 'v3') {
    if ((form.snmpCommunity && !form.snmpCommunity.trim()) || (!form.snmpCommunity && !device.hasSnmpCommunity)) errors['snmp-community'] = 'Community değerini girin.';
    else if (form.snmpCommunity.length > 255) errors['snmp-community'] = 'En fazla 255 karakter girin.';
  } else {
    if (!form.snmpV3Username.trim()) errors['snmp-v3-username'] = 'SNMPv3 kullanıcı adını girin.';
    else if (form.snmpV3Username.trim().length > 64 || !/^[\x21-\x7e]+$/.test(form.snmpV3Username.trim())) errors['snmp-v3-username'] = '1–64 karakter kullanın; boşluk veya Türkçe karakter kullanmayın.';
    if (form.snmpV3AuthPassword ? form.snmpV3AuthPassword.length < 8 || form.snmpV3AuthPassword.length > 255 : !device.hasSnmpV3AuthPassword) errors['snmp-v3-auth-password'] = '8–255 karakterlik doğrulama parolası girin.';
    if (form.snmpV3SecurityLevel === 'authPriv' && (form.snmpV3PrivacyPassword ? form.snmpV3PrivacyPassword.length < 8 || form.snmpV3PrivacyPassword.length > 255 : !device.hasSnmpV3PrivacyPassword)) errors['snmp-v3-privacy-password'] = '8–255 karakterlik şifreleme parolası girin.';
  }
  if (!Number.isInteger(form.sshPort) || form.sshPort < 1 || form.sshPort > 65535) errors['ssh-port'] = '1–65535 arasında bir port girin.';
  if (form.sshPassword && !form.sshUsername.trim()) errors['ssh-username'] = 'SSH parolası için kullanıcı adını girin.';
  return errors;
}

export function buildEditPayload(form: NmsEditForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    managementIp: form.managementIp.trim(), snmpPort: form.snmpPort, snmpVersion: form.snmpVersion,
    pollingEnabled: form.pollingEnabled, pollingInterval: form.pollingInterval,
    sshUsername: form.sshUsername.trim(), sshPort: form.sshPort,
  };
  if (form.snmpVersion !== 'v3') {
    if (form.snmpCommunity) payload.snmpCommunity = form.snmpCommunity;
  } else {
    payload.snmpV3Username = form.snmpV3Username.trim();
    payload.snmpV3SecurityLevel = form.snmpV3SecurityLevel;
    payload.snmpV3AuthProtocol = form.snmpV3AuthProtocol;
    if (form.snmpV3AuthPassword) payload.snmpV3AuthPassword = form.snmpV3AuthPassword;
    if (form.snmpV3SecurityLevel === 'authPriv') {
      payload.snmpV3PrivacyProtocol = form.snmpV3PrivacyProtocol;
      if (form.snmpV3PrivacyPassword) payload.snmpV3PrivacyPassword = form.snmpV3PrivacyPassword;
    }
  }
  if (form.sshPassword) payload.sshPassword = form.sshPassword;
  return payload;
}

export function getEditChanges(form: NmsEditForm, device: EditableNmsDevice) {
  const original = createEditForm(device);
  const changes: { label: string; before: string; after: string; secret?: boolean }[] = [];
  function add(key: keyof NmsEditForm, label: string, format: (value: NmsEditForm[typeof key]) => string = String) {
    const before = typeof original[key] === 'string' ? (original[key] as string).trim() : original[key];
    const after = typeof form[key] === 'string' ? (form[key] as string).trim() : form[key];
    if (before !== after) changes.push({ label, before: format(before) || 'Girilmedi', after: format(after) || 'Girilmedi' });
  }
  add('managementIp', 'Yönetim IP'); add('snmpPort', 'SNMP portu');
  add('snmpVersion', 'SNMP sürümü', value => `SNMP${value}`);
  add('pollingEnabled', 'Veri toplama', value => value ? 'Etkin' : 'Kapalı');
  add('pollingInterval', 'Toplama aralığı', value => `${value} saniye`);
  add('sshUsername', 'SSH kullanıcı adı'); add('sshPort', 'SSH portu');
  if (form.snmpVersion === 'v3') {
    add('snmpV3Username', 'SNMPv3 kullanıcı adı');
    add('snmpV3SecurityLevel', 'Güvenlik seviyesi', value => value === 'authPriv' ? 'Doğrulama + şifreleme' : 'Yalnızca doğrulama');
    add('snmpV3AuthProtocol', 'Doğrulama protokolü');
    if (form.snmpV3SecurityLevel === 'authPriv') add('snmpV3PrivacyProtocol', 'Şifreleme protokolü');
  }
  const secrets = form.snmpVersion !== 'v3'
    ? [{ value: form.snmpCommunity, label: 'Community', stored: device.hasSnmpCommunity }]
    : [{ value: form.snmpV3AuthPassword, label: 'Doğrulama parolası', stored: device.hasSnmpV3AuthPassword }, ...(form.snmpV3SecurityLevel === 'authPriv' ? [{ value: form.snmpV3PrivacyPassword, label: 'Şifreleme parolası', stored: device.hasSnmpV3PrivacyPassword }] : [])];
  secrets.push({ value: form.sshPassword, label: 'SSH parolası', stored: device.hasSshPassword });
  for (const { value, label, stored } of secrets) if (value) changes.push({ label, before: stored ? 'Kayıtlı değer' : 'Girilmedi', after: 'Yeni değer girildi', secret: true });
  return changes;
}
