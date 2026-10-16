export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
export type IncidentDetailAction = 'ACKNOWLEDGE' | 'UNACKNOWLEDGE' | 'RESOLVE' | 'CLOSE' | 'ARCHIVE' | 'RESTORE' | 'SET_LEGAL_HOLD' | 'RELEASE_LEGAL_HOLD' | 'ASSIGN' | 'ADD_NOTE';
export interface IncidentActionPayload { assigneeId?: string | null; reason?: string; requestId?: string }

export interface IncidentDetailEvent {
  id: string;
  title: string;
  severity: string;
  message: string;
  deviceName: string | null;
  sourceIp: string | null;
  createdAt: string;
  notifiedAt: string | null;
  notifyChannel: string | null;
  alarm: { code: string; name: string; description: string | null; category: string; source?: string };
  incident?: {
    id: string; status: IncidentStatus; archiveState: 'HOT' | 'ARCHIVED'; legalHold: boolean;
    firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; reopenCount: number; assignedTo: string | null; assignedToId?: string | null;
  };
}

export interface IncidentDetailData extends NonNullable<IncidentDetailEvent['incident']> {
  title: string;
  severity: string;
  source: string;
  message: string;
  transitions: Array<{
    id: string; type: string; fromStatus: IncidentStatus | null; toStatus: IncidentStatus | null;
    actorType: string; actorName: string | null; reason: string | null; createdAt: string;
    metadata?: { assigneeName?: string | null; previousAssigneeName?: string | null } | null;
  }>;
  occurrences: Array<{ id: string; title: string; deviceName: string | null; createdAt: string }>;
  notificationAttempts: Array<{ id: string; channel: string; status: string; attempt: number; error: string | null; createdAt: string }>;
}

export const incidentStatusLabels: Record<IncidentStatus, string> = { OPEN: 'Açık', ACKNOWLEDGED: 'Onaylandı', RESOLVED: 'Çözüldü', CLOSED: 'Kapatıldı' };
export const incidentSeverityLabels: Record<string, string> = { ALARM_CRITICAL: 'Kritik', ALARM_HIGH: 'Yüksek', ALARM_MEDIUM: 'Orta', ALARM_LOW: 'Düşük', ALARM_INFO: 'Bilgi' };
const transitionLabels: Record<string, string> = {
  CREATED: 'Olay açıldı', MIGRATED: 'Olay kaydı oluşturuldu', ACKNOWLEDGED: 'Olay onaylandı',
  UNACKNOWLEDGED: 'Onay geri alındı', RESOLVED: 'Olay çözüldü', REOPENED: 'Olay yeniden açıldı',
  CLOSED: 'Olay kapatıldı', ARCHIVED: 'Olay arşivlendi', RESTORED: 'Olay arşivden çıkarıldı',
  ASSIGNED: 'Sorumlu güncellendi', NOTE_ADDED: 'Operasyon notu eklendi', LEGAL_HOLD_SET: 'Saklama koruması etkinleştirildi', LEGAL_HOLD_RELEASED: 'Saklama koruması kaldırıldı',
};
const deliveryLabels: Record<string, string> = {
  PENDING: 'Bildirim bekliyor', SENT: 'Bildirim gönderildi', FAILED_RETRYABLE: 'Bildirim yeniden denenecek',
  FAILED_PERMANENT: 'Bildirim gönderilemedi', SKIPPED_DISABLED: 'Bildirim kapalı olduğu için atlandı',
  SKIPPED_RATE_LIMITED: 'Bildirim hız sınırı nedeniyle atlandı', SKIPPED_COOLDOWN: 'Bildirim bekleme süresi nedeniyle atlandı',
};

export function incidentSourceLabel(source?: string) {
  const value = source?.toLowerCase();
  if (value === 'nms') return 'NMS / Switch';
  if (value === 'vmware') return 'VMware';
  if (value === 'fortianalyzer') return 'FortiAnalyzer';
  if (value === 'fortigate-sslvpn') return 'FortiGate SSL-VPN';
  return source || 'Belirtilmemiş';
}

export function incidentDate(value?: string | null, timeOnly = false) {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return new Date(value).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', ...(timeOnly ? {} : { day: '2-digit', month: 'short', year: 'numeric' }),
    hour: '2-digit', minute: '2-digit',
  });
}

export type HistoryKind = 'transition' | 'occurrence' | 'notification' | 'note';
export interface IncidentHistoryEntry {
  id: string; kind: HistoryKind; type: string; title: string; createdAt: string;
  actor: string | null; description: string | null; reason: string | null;
}
export function buildIncidentHistory(detail: IncidentDetailData): IncidentHistoryEntry[] {
  const transitions: IncidentHistoryEntry[] = detail.transitions.map(item => ({
    id: `transition:${item.id}`, kind: item.type === 'NOTE_ADDED' ? 'note' : 'transition', type: item.type,
    title: transitionLabels[item.type] || 'Olay güncellendi', createdAt: item.createdAt,
    actor: item.actorType === 'SYSTEM' ? item.actorName ? `Sistem · ${item.actorName}` : 'Sistem' : item.actorName || 'Kullanıcı',
    description: item.type === 'ASSIGNED' && item.metadata && 'assigneeName' in item.metadata
      ? `${item.metadata.previousAssigneeName || 'Atanmamış'} → ${item.metadata.assigneeName || 'Atanmamış'}`
      : item.fromStatus && item.toStatus && item.fromStatus !== item.toStatus
      ? `${incidentStatusLabels[item.fromStatus]} → ${incidentStatusLabels[item.toStatus]}` : null,
    reason: item.reason === 'First occurrence detected' ? 'İlk alarm oluşumu tespit edildi.' : item.reason,
  }));
  const occurrences: IncidentHistoryEntry[] = detail.occurrences.map(item => ({
    id: `occurrence:${item.id}`, kind: 'occurrence', type: 'OCCURRENCE', title: 'Alarm oluşumu kaydedildi',
    createdAt: item.createdAt, actor: null, description: item.deviceName || incidentSourceLabel(detail.source), reason: null,
  }));
  const notifications: IncidentHistoryEntry[] = detail.notificationAttempts.map(item => ({
    id: `notification:${item.id}`, kind: 'notification', type: item.status, title: deliveryLabels[item.status] || 'Bildirim durumu güncellendi',
    createdAt: item.createdAt, actor: null, description: `${item.channel === 'email' ? 'E-posta' : item.channel} · ${item.attempt}. deneme`, reason: item.error,
  }));
  return [...transitions, ...occurrences, ...notifications].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id));
}

export function incidentHistoryHighlights(history: IncidentHistoryEntry[]): IncidentHistoryEntry[] {
  // Keep a noisy alarm from burying lifecycle decisions in the overview.
  const ids = new Set([
    ...history.filter(entry => entry.kind === 'transition').slice(0, 3),
    ...history.filter(entry => entry.kind === 'occurrence').slice(0, 1),
    ...history.filter(entry => entry.kind === 'notification').slice(0, 1),
    ...history.filter(entry => entry.kind === 'note').slice(0, 1),
  ].map(entry => entry.id));
  return history.filter(entry => ids.has(entry.id));
}

export interface IncidentActionItem { action: IncidentDetailAction; label: string; primary?: boolean; disabled?: boolean }
export function incidentLifecycleActions(incident?: Pick<IncidentDetailData, 'status' | 'archiveState' | 'legalHold'>): IncidentActionItem[] {
  if (!incident) return [];
  if (incident.archiveState === 'ARCHIVED') return [{ action: 'RESTORE', label: 'Arşivden çıkar', primary: true }];
  if (incident.status === 'OPEN') return [{ action: 'ACKNOWLEDGE', label: 'Onayla', primary: true }, { action: 'RESOLVE', label: 'Çözüldü olarak işaretle' }];
  if (incident.status === 'ACKNOWLEDGED') return [{ action: 'RESOLVE', label: 'Çözüldü olarak işaretle', primary: true }];
  if (incident.status === 'RESOLVED') return [{ action: 'CLOSE', label: 'Olayı kapat', primary: true }];
  if (incident.status === 'CLOSED') return [{ action: 'ARCHIVE', label: 'Arşivle', primary: true }];
  return [];
}
