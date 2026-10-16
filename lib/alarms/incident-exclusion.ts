export type IncidentExclusionField = 'sourceIp' | 'destIp' | 'user' | 'deviceName';

export function incidentExclusionTarget(event: {
  alarm: { code: string }; sourceIp?: string | null; destIp?: string | null; deviceName?: string | null;
}): { field: IncidentExclusionField; value: string } {
  const code = event.alarm.code;
  const field = code === 'SSLVPN_AUTH_FAILED' ? 'user'
    : event.destIp && code.includes('DNS') ? 'destIp'
    : code.startsWith('NMS_') || code.startsWith('VM_') ? 'deviceName' : 'sourceIp';
  const value = field === 'sourceIp' ? event.sourceIp : field === 'destIp' ? event.destIp : event.deviceName;
  return { field, value: value?.trim() || '' };
}

export function alarmWhitelistLockKey(alarmCode: string, field: string, value: string): string {
  return JSON.stringify(['alarm-whitelist', alarmCode, field, value]);
}
